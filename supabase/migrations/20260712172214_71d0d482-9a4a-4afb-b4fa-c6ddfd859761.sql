-- ============================================================
-- CONTROL TOTAL: audit log + dynamic admin RPCs + revert
-- ============================================================

-- Tabla de auditoría
CREATE TABLE IF NOT EXISTS public.admin_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tabla text NOT NULL,
  row_pk text NOT NULL,
  accion text NOT NULL CHECK (accion IN ('UPDATE','DELETE','REVERT_UPDATE','REVERT_INSERT')),
  before_data jsonb,
  after_data jsonb,
  reverted boolean NOT NULL DEFAULT false,
  reverted_at timestamptz,
  reverted_by uuid,
  usuario_id uuid,
  usuario_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.admin_audit TO authenticated;
GRANT ALL ON public.admin_audit TO service_role;

ALTER TABLE public.admin_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_audit_admin_read" ON public.admin_audit;
CREATE POLICY "admin_audit_admin_read" ON public.admin_audit
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'ADMIN'::public.app_role));

CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON public.admin_audit (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_tabla ON public.admin_audit (tabla, created_at DESC);

-- ============================================================
-- Whitelist de tablas editables
-- ============================================================
CREATE OR REPLACE FUNCTION public._admin_table_allowed(p_tabla text)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT p_tabla = ANY (ARRAY[
    'almacenes','clientes_proveedores','estados','insumos','insumos_movimientos',
    'inventario_conteo','inventarios_fisicos','lotes','mercados','movimientos',
    'ordenes_etiquetado','productos','stock_lote_ubicacion','ubicaciones',
    'ventas_cotizaciones','ventas_cot_items','ventas_ordenes','ventas_orden_items',
    'ventas_facturas','ventas_factura_items','ventas_guias','ventas_guia_items','warrants'
  ])
$$;

-- ============================================================
-- Listar columnas con su tipo (para armar el formulario dinámico)
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_list_table_columns(p_tabla text)
RETURNS TABLE(column_name text, data_type text, udt_name text, is_nullable text, column_default text, ordinal_position int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'ADMIN'::public.app_role) THEN
    RAISE EXCEPTION 'Solo ADMIN';
  END IF;
  IF NOT public._admin_table_allowed(p_tabla) THEN
    RAISE EXCEPTION 'Tabla no permitida: %', p_tabla;
  END IF;
  RETURN QUERY
  SELECT c.column_name::text, c.data_type::text, c.udt_name::text,
         c.is_nullable::text, c.column_default::text, c.ordinal_position::int
  FROM information_schema.columns c
  WHERE c.table_schema='public' AND c.table_name=p_tabla
  ORDER BY c.ordinal_position;
END $$;

REVOKE EXECUTE ON FUNCTION public.admin_list_table_columns(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_table_columns(text) TO authenticated;

-- ============================================================
-- Helper: recalc stock cuando afecta movimientos
-- ============================================================
CREATE OR REPLACE FUNCTION public._admin_recalc_mov(p_lote uuid, p_orig uuid, p_dest uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='public'
AS $$
BEGIN
  IF p_lote IS NULL THEN RETURN; END IF;
  IF p_orig IS NOT NULL THEN PERFORM public.recalc_stock_lote_ubic(p_lote, p_orig); END IF;
  IF p_dest IS NOT NULL AND p_dest IS DISTINCT FROM p_orig THEN
    PERFORM public.recalc_stock_lote_ubic(p_lote, p_dest);
  END IF;
END $$;

-- ============================================================
-- UPDATE dinámico
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_update_row(p_tabla text, p_id text, p_patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='public'
AS $$
DECLARE
  v_before jsonb; v_after jsonb; v_key text; v_udt text; v_email text;
  v_lote_b uuid; v_orig_b uuid; v_dest_b uuid;
  v_lote_a uuid; v_orig_a uuid; v_dest_a uuid;
BEGIN
  IF NOT public.has_role(auth.uid(),'ADMIN'::public.app_role) THEN RAISE EXCEPTION 'Solo ADMIN'; END IF;
  IF NOT public._admin_table_allowed(p_tabla) THEN RAISE EXCEPTION 'Tabla no permitida: %', p_tabla; END IF;
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN RAISE EXCEPTION 'Patch inválido'; END IF;

  -- Snapshot antes
  EXECUTE format('SELECT to_jsonb(t.*) FROM public.%I t WHERE id::text = $1', p_tabla)
    INTO v_before USING p_id;
  IF v_before IS NULL THEN RAISE EXCEPTION 'Registro no encontrado'; END IF;

  -- Bypass del bloqueo de movimientos
  PERFORM set_config('app.bypass_movimientos_block','true', true);

  -- Aplicar cada campo del patch
  FOR v_key IN SELECT jsonb_object_keys(p_patch) LOOP
    IF v_key IN ('id','created_at') THEN CONTINUE; END IF;
    SELECT udt_name INTO v_udt FROM information_schema.columns
      WHERE table_schema='public' AND table_name=p_tabla AND column_name=v_key;
    IF v_udt IS NULL THEN CONTINUE; END IF;
    IF (p_patch->v_key) IS NULL OR jsonb_typeof(p_patch->v_key)='null' THEN
      EXECUTE format('UPDATE public.%I SET %I = NULL WHERE id::text = $1', p_tabla, v_key) USING p_id;
    ELSE
      EXECUTE format('UPDATE public.%I SET %I = ($1::jsonb ->> %L)::%I WHERE id::text = $2',
        p_tabla, v_key, v_key, v_udt) USING p_patch, p_id;
    END IF;
  END LOOP;

  -- Snapshot después
  EXECUTE format('SELECT to_jsonb(t.*) FROM public.%I t WHERE id::text = $1', p_tabla)
    INTO v_after USING p_id;

  -- Recalc si es movimientos
  IF p_tabla = 'movimientos' THEN
    v_lote_b := (v_before->>'lote_id')::uuid;
    v_orig_b := NULLIF(v_before->>'ubicacion_origen_id','')::uuid;
    v_dest_b := NULLIF(v_before->>'ubicacion_destino_id','')::uuid;
    v_lote_a := (v_after ->>'lote_id')::uuid;
    v_orig_a := NULLIF(v_after ->>'ubicacion_origen_id','')::uuid;
    v_dest_a := NULLIF(v_after ->>'ubicacion_destino_id','')::uuid;
    PERFORM public._admin_recalc_mov(v_lote_b, v_orig_b, v_dest_b);
    PERFORM public._admin_recalc_mov(v_lote_a, v_orig_a, v_dest_a);
  END IF;

  SELECT COALESCE(email,'') INTO v_email FROM auth.users WHERE id = auth.uid();
  INSERT INTO public.admin_audit(tabla, row_pk, accion, before_data, after_data, usuario_id, usuario_email)
  VALUES (p_tabla, p_id, 'UPDATE', v_before, v_after, auth.uid(), v_email);

  RETURN v_after;
END $$;

REVOKE EXECUTE ON FUNCTION public.admin_update_row(text,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_row(text,text,jsonb) TO authenticated;

-- ============================================================
-- DELETE dinámico
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_delete_row(p_tabla text, p_id text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='public'
AS $$
DECLARE v_before jsonb; v_email text; v_lote uuid; v_orig uuid; v_dest uuid;
BEGIN
  IF NOT public.has_role(auth.uid(),'ADMIN'::public.app_role) THEN RAISE EXCEPTION 'Solo ADMIN'; END IF;
  IF NOT public._admin_table_allowed(p_tabla) THEN RAISE EXCEPTION 'Tabla no permitida: %', p_tabla; END IF;

  EXECUTE format('SELECT to_jsonb(t.*) FROM public.%I t WHERE id::text = $1', p_tabla)
    INTO v_before USING p_id;
  IF v_before IS NULL THEN RAISE EXCEPTION 'Registro no encontrado'; END IF;

  PERFORM set_config('app.bypass_movimientos_block','true', true);
  EXECUTE format('DELETE FROM public.%I WHERE id::text = $1', p_tabla) USING p_id;

  IF p_tabla = 'movimientos' THEN
    v_lote := (v_before->>'lote_id')::uuid;
    v_orig := NULLIF(v_before->>'ubicacion_origen_id','')::uuid;
    v_dest := NULLIF(v_before->>'ubicacion_destino_id','')::uuid;
    PERFORM public._admin_recalc_mov(v_lote, v_orig, v_dest);
  END IF;

  SELECT COALESCE(email,'') INTO v_email FROM auth.users WHERE id = auth.uid();
  INSERT INTO public.admin_audit(tabla, row_pk, accion, before_data, after_data, usuario_id, usuario_email)
  VALUES (p_tabla, p_id, 'DELETE', v_before, NULL, auth.uid(), v_email);
END $$;

REVOKE EXECUTE ON FUNCTION public.admin_delete_row(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_row(text,text) TO authenticated;

-- ============================================================
-- REVERT: restaura before_data del audit
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_revert_audit(p_audit_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='public'
AS $$
DECLARE
  a record; v_after jsonb; v_key text; v_udt text; v_email text; v_exists boolean;
  v_lote_b uuid; v_orig_b uuid; v_dest_b uuid;
  v_lote_a uuid; v_orig_a uuid; v_dest_a uuid;
BEGIN
  IF NOT public.has_role(auth.uid(),'ADMIN'::public.app_role) THEN RAISE EXCEPTION 'Solo ADMIN'; END IF;
  SELECT * INTO a FROM public.admin_audit WHERE id = p_audit_id;
  IF a IS NULL THEN RAISE EXCEPTION 'Auditoría no existe'; END IF;
  IF a.reverted THEN RAISE EXCEPTION 'Este cambio ya fue revertido'; END IF;
  IF a.before_data IS NULL THEN RAISE EXCEPTION 'No hay snapshot para restaurar'; END IF;

  PERFORM set_config('app.bypass_movimientos_block','true', true);

  -- ¿Existe la fila hoy?
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE id::text = $1)', a.tabla)
    INTO v_exists USING a.row_pk;

  IF v_exists THEN
    -- UPDATE columna por columna al before_data
    FOR v_key IN SELECT jsonb_object_keys(a.before_data) LOOP
      IF v_key IN ('created_at') THEN CONTINUE; END IF;
      SELECT udt_name INTO v_udt FROM information_schema.columns
        WHERE table_schema='public' AND table_name=a.tabla AND column_name=v_key;
      IF v_udt IS NULL THEN CONTINUE; END IF;
      IF (a.before_data->v_key) IS NULL OR jsonb_typeof(a.before_data->v_key)='null' THEN
        EXECUTE format('UPDATE public.%I SET %I = NULL WHERE id::text = $1', a.tabla, v_key) USING a.row_pk;
      ELSE
        EXECUTE format('UPDATE public.%I SET %I = ($1::jsonb ->> %L)::%I WHERE id::text = $2',
          a.tabla, v_key, v_key, v_udt) USING a.before_data, a.row_pk;
      END IF;
    END LOOP;
    EXECUTE format('SELECT to_jsonb(t.*) FROM public.%I t WHERE id::text = $1', a.tabla)
      INTO v_after USING a.row_pk;
    INSERT INTO public.admin_audit(tabla,row_pk,accion,before_data,after_data,usuario_id,usuario_email)
    VALUES (a.tabla, a.row_pk, 'REVERT_UPDATE', NULL, v_after, auth.uid(),
      (SELECT COALESCE(email,'') FROM auth.users WHERE id=auth.uid()));
  ELSE
    -- Re-insertar la fila desde before_data
    EXECUTE format(
      'INSERT INTO public.%I SELECT * FROM jsonb_populate_record(NULL::public.%I, $1) RETURNING to_jsonb(public.%I.*)',
      a.tabla, a.tabla, a.tabla
    ) INTO v_after USING a.before_data;
    INSERT INTO public.admin_audit(tabla,row_pk,accion,before_data,after_data,usuario_id,usuario_email)
    VALUES (a.tabla, a.row_pk, 'REVERT_INSERT', NULL, v_after, auth.uid(),
      (SELECT COALESCE(email,'') FROM auth.users WHERE id=auth.uid()));
  END IF;

  -- Recalc si es movimientos
  IF a.tabla = 'movimientos' THEN
    v_lote_b := (a.before_data->>'lote_id')::uuid;
    v_orig_b := NULLIF(a.before_data->>'ubicacion_origen_id','')::uuid;
    v_dest_b := NULLIF(a.before_data->>'ubicacion_destino_id','')::uuid;
    v_lote_a := (v_after->>'lote_id')::uuid;
    v_orig_a := NULLIF(v_after->>'ubicacion_origen_id','')::uuid;
    v_dest_a := NULLIF(v_after->>'ubicacion_destino_id','')::uuid;
    PERFORM public._admin_recalc_mov(v_lote_b, v_orig_b, v_dest_b);
    PERFORM public._admin_recalc_mov(v_lote_a, v_orig_a, v_dest_a);
  END IF;

  UPDATE public.admin_audit SET reverted=true, reverted_at=now(), reverted_by=auth.uid()
    WHERE id = p_audit_id;

  RETURN v_after;
END $$;

REVOKE EXECUTE ON FUNCTION public.admin_revert_audit(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_revert_audit(uuid) TO authenticated;