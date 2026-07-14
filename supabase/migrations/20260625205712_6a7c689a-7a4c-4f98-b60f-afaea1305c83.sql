
-- 1) calidad_codigos.producido -> numeric
ALTER TABLE public.calidad_codigos
  ALTER COLUMN producido TYPE numeric USING NULLIF(regexp_replace(coalesce(producido,''), '[^0-9.\-]', '', 'g'), '')::numeric;

-- 2) movimientos.tercero
ALTER TABLE public.movimientos ADD COLUMN IF NOT EXISTS tercero text;

-- 3) Nuevo tipo CAMBIO
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel='CAMBIO' AND enumtypid='tipo_mov_t'::regtype) THEN
    ALTER TYPE public.tipo_mov_t ADD VALUE 'CAMBIO';
  END IF;
END $$;

-- 4) registrar_movimiento con p_tercero
CREATE OR REPLACE FUNCTION public.registrar_movimiento(
  p_tipo tipo_mov_t, p_lote_id uuid, p_cantidad numeric,
  p_ubic_origen uuid DEFAULT NULL, p_ubic_destino uuid DEFAULT NULL,
  p_cliente_proveedor uuid DEFAULT NULL, p_nro_guia text DEFAULT NULL,
  p_nro_vale text DEFAULT NULL, p_motivo text DEFAULT NULL,
  p_fecha date DEFAULT CURRENT_DATE, p_observaciones text DEFAULT NULL,
  p_nro_warrant text DEFAULT NULL, p_latas integer DEFAULT NULL,
  p_piso integer DEFAULT NULL, p_mercado_id uuid DEFAULT NULL,
  p_tiene_etiqueta boolean DEFAULT NULL, p_tercero text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_stock numeric; v_warrant numeric; v_total_lote numeric; v_mov_id uuid;
  v_lote record; v_certificacion text; v_tiene_warrant boolean;
  v_tiene_etiqueta boolean; v_etiqueta text; v_user_email text;
BEGIN
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN
    RAISE EXCEPTION 'La cantidad debe ser mayor a 0';
  END IF;
  SELECT * INTO v_lote FROM public.lotes WHERE id = p_lote_id;
  IF v_lote IS NULL THEN RAISE EXCEPTION 'Lote no existe'; END IF;

  IF p_tipo IN ('SALIDA','MERMA','AJUSTE_NEGATIVO') THEN
    IF p_ubic_origen IS NULL THEN RAISE EXCEPTION 'Ubicación de origen requerida'; END IF;
    SELECT COALESCE(cantidad_cajas,0) INTO v_stock FROM public.stock_lote_ubicacion
      WHERE lote_id=p_lote_id AND ubicacion_id=p_ubic_origen;
    IF v_stock IS NULL THEN v_stock := 0; END IF;
    IF v_stock < p_cantidad THEN
      RAISE EXCEPTION 'Stock insuficiente. Disponible: %, solicitado: %', v_stock, p_cantidad;
    END IF;
    SELECT COALESCE(SUM(cantidad_cajas_warrant),0) INTO v_warrant FROM public.warrants
      WHERE lote_id=p_lote_id AND estado='ACTIVO';
    SELECT COALESCE(SUM(cantidad_cajas),0) INTO v_total_lote FROM public.stock_lote_ubicacion
      WHERE lote_id=p_lote_id;
    IF (v_total_lote - p_cantidad) < v_warrant THEN
      RAISE EXCEPTION 'Bloqueado por warrant. Total: %, comprometido: %', v_total_lote, v_warrant;
    END IF;
    UPDATE public.stock_lote_ubicacion SET cantidad_cajas=cantidad_cajas-p_cantidad, updated_at=now()
      WHERE lote_id=p_lote_id AND ubicacion_id=p_ubic_origen;
  ELSIF p_tipo IN ('ENTRADA','AJUSTE_POSITIVO') THEN
    IF p_ubic_destino IS NULL THEN RAISE EXCEPTION 'Ubicación de destino requerida'; END IF;
    INSERT INTO public.stock_lote_ubicacion(lote_id, ubicacion_id, cantidad_cajas)
    VALUES (p_lote_id, p_ubic_destino, p_cantidad)
    ON CONFLICT (lote_id, ubicacion_id)
    DO UPDATE SET cantidad_cajas=public.stock_lote_ubicacion.cantidad_cajas+p_cantidad, updated_at=now();
  ELSIF p_tipo = 'TRASLADO' THEN
    IF p_ubic_origen IS NULL OR p_ubic_destino IS NULL THEN RAISE EXCEPTION 'Traslado requiere origen y destino'; END IF;
    SELECT COALESCE(cantidad_cajas,0) INTO v_stock FROM public.stock_lote_ubicacion
      WHERE lote_id=p_lote_id AND ubicacion_id=p_ubic_origen;
    IF v_stock IS NULL OR v_stock < p_cantidad THEN
      RAISE EXCEPTION 'Stock insuficiente en origen: %', COALESCE(v_stock,0);
    END IF;
    UPDATE public.stock_lote_ubicacion SET cantidad_cajas=cantidad_cajas-p_cantidad, updated_at=now()
      WHERE lote_id=p_lote_id AND ubicacion_id=p_ubic_origen;
    INSERT INTO public.stock_lote_ubicacion(lote_id, ubicacion_id, cantidad_cajas)
    VALUES (p_lote_id, p_ubic_destino, p_cantidad)
    ON CONFLICT (lote_id, ubicacion_id)
    DO UPDATE SET cantidad_cajas=public.stock_lote_ubicacion.cantidad_cajas+p_cantidad, updated_at=now();
  END IF;

  v_certificacion := NULLIF(trim(both ' ' FROM concat_ws(' · ', v_lote.certificadora, to_char(v_lote.fecha_certificacion,'DD-MM-YYYY'))),'');
  v_tiene_etiqueta := COALESCE(p_tiene_etiqueta, v_lote.etiqueta IS NOT NULL AND v_lote.etiqueta <> 'S/E');
  v_etiqueta := CASE WHEN v_tiene_etiqueta THEN COALESCE(NULLIF(v_lote.etiqueta,''), 'SI') ELSE NULL END;

  IF p_nro_warrant IS NOT NULL AND length(trim(p_nro_warrant)) > 0 THEN
    v_tiene_warrant := true;
  ELSE
    SELECT EXISTS (SELECT 1 FROM public.warrants WHERE lote_id=p_lote_id AND estado='ACTIVO') INTO v_tiene_warrant;
  END IF;

  SELECT email INTO v_user_email FROM auth.users WHERE id = auth.uid();

  INSERT INTO public.movimientos(
    tipo, fecha, lote_id, ubicacion_origen_id, ubicacion_destino_id,
    cantidad_cajas, nro_guia, nro_vale, cliente_proveedor_id, motivo, usuario_id, usuario_nombre,
    nro_warrant, tiene_warrant, mercado, observaciones, certificacion,
    etiqueta, tiene_etiqueta, estado_lote, latas, piso, mercado_id, tercero
  ) VALUES (
    p_tipo, p_fecha, p_lote_id, p_ubic_origen, p_ubic_destino,
    p_cantidad, p_nro_guia, p_nro_vale, p_cliente_proveedor, p_motivo, auth.uid(), v_user_email,
    NULLIF(trim(COALESCE(p_nro_warrant,'')),''), v_tiene_warrant, v_lote.mercado,
    NULLIF(trim(COALESCE(p_observaciones,'')),''), v_certificacion,
    v_etiqueta, v_tiene_etiqueta, v_lote.estado, p_latas, p_piso, p_mercado_id,
    NULLIF(trim(COALESCE(p_tercero,'')),'')
  ) RETURNING id INTO v_mov_id;
  RETURN v_mov_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.registrar_movimiento(tipo_mov_t,uuid,numeric,uuid,uuid,uuid,text,text,text,date,text,text,integer,integer,uuid,boolean,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_movimiento(tipo_mov_t,uuid,numeric,uuid,uuid,uuid,text,text,text,date,text,text,integer,integer,uuid,boolean,text) TO authenticated, service_role;

-- 5) admin_editar_movimiento con p_tercero
CREATE OR REPLACE FUNCTION public.admin_editar_movimiento(
  p_mov uuid, p_tipo tipo_mov_t, p_fecha date, p_lote_id uuid,
  p_ubic_origen uuid, p_ubic_destino uuid, p_cantidad_cajas numeric,
  p_latas integer, p_piso integer, p_nro_guia text, p_nro_vale text,
  p_cliente uuid, p_motivo text, p_observaciones text, p_nro_warrant text,
  p_mercado_id uuid DEFAULT NULL, p_tiene_etiqueta boolean DEFAULT NULL,
  p_tercero text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  m record; v_lote record; v_certificacion text; v_tiene_etiqueta boolean;
  v_etiqueta text; v_tiene_warrant boolean; v_tipo public.tipo_mov_t;
  v_fecha date; v_lote_id uuid; v_cantidad numeric;
BEGIN
  IF NOT public.has_role(auth.uid(), 'ADMIN') THEN RAISE EXCEPTION 'Solo ADMIN'; END IF;
  SELECT * INTO m FROM public.movimientos WHERE id=p_mov;
  IF m IS NULL THEN RAISE EXCEPTION 'Movimiento no existe'; END IF;
  v_tipo := COALESCE(p_tipo, m.tipo);
  v_fecha := COALESCE(p_fecha, m.fecha);
  v_lote_id := COALESCE(p_lote_id, m.lote_id);
  v_cantidad := COALESCE(p_cantidad_cajas, m.cantidad_cajas);
  IF v_cantidad IS NULL OR v_cantidad <= 0 THEN RAISE EXCEPTION 'La cantidad debe ser mayor a 0'; END IF;

  SELECT * INTO v_lote FROM public.lotes WHERE id=v_lote_id;
  IF v_lote IS NULL THEN RAISE EXCEPTION 'Lote no existe'; END IF;

  -- Revertir efecto anterior
  IF m.tipo IN ('SALIDA','MERMA','AJUSTE_NEGATIVO') THEN
    INSERT INTO public.stock_lote_ubicacion(lote_id, ubicacion_id, cantidad_cajas)
    VALUES (m.lote_id, m.ubicacion_origen_id, m.cantidad_cajas)
    ON CONFLICT (lote_id, ubicacion_id) DO UPDATE
      SET cantidad_cajas=public.stock_lote_ubicacion.cantidad_cajas+EXCLUDED.cantidad_cajas, updated_at=now();
  ELSIF m.tipo IN ('ENTRADA','AJUSTE_POSITIVO') THEN
    UPDATE public.stock_lote_ubicacion SET cantidad_cajas=GREATEST(cantidad_cajas-m.cantidad_cajas,0), updated_at=now()
      WHERE lote_id=m.lote_id AND ubicacion_id=m.ubicacion_destino_id;
  ELSIF m.tipo='TRASLADO' THEN
    INSERT INTO public.stock_lote_ubicacion(lote_id, ubicacion_id, cantidad_cajas)
    VALUES (m.lote_id, m.ubicacion_origen_id, m.cantidad_cajas)
    ON CONFLICT (lote_id, ubicacion_id) DO UPDATE
      SET cantidad_cajas=public.stock_lote_ubicacion.cantidad_cajas+EXCLUDED.cantidad_cajas, updated_at=now();
    UPDATE public.stock_lote_ubicacion SET cantidad_cajas=GREATEST(cantidad_cajas-m.cantidad_cajas,0), updated_at=now()
      WHERE lote_id=m.lote_id AND ubicacion_id=m.ubicacion_destino_id;
  END IF;

  -- Aplicar nuevo efecto
  IF v_tipo IN ('ENTRADA','AJUSTE_POSITIVO') THEN
    INSERT INTO public.stock_lote_ubicacion(lote_id, ubicacion_id, cantidad_cajas)
    VALUES (v_lote_id, p_ubic_destino, v_cantidad)
    ON CONFLICT (lote_id, ubicacion_id) DO UPDATE
      SET cantidad_cajas=public.stock_lote_ubicacion.cantidad_cajas+EXCLUDED.cantidad_cajas, updated_at=now();
  ELSIF v_tipo IN ('SALIDA','MERMA','AJUSTE_NEGATIVO') THEN
    INSERT INTO public.stock_lote_ubicacion(lote_id, ubicacion_id, cantidad_cajas)
    VALUES (v_lote_id, p_ubic_origen, 0) ON CONFLICT (lote_id, ubicacion_id) DO NOTHING;
    UPDATE public.stock_lote_ubicacion SET cantidad_cajas=GREATEST(cantidad_cajas-v_cantidad,0), updated_at=now()
      WHERE lote_id=v_lote_id AND ubicacion_id=p_ubic_origen;
  ELSIF v_tipo='TRASLADO' THEN
    INSERT INTO public.stock_lote_ubicacion(lote_id, ubicacion_id, cantidad_cajas)
    VALUES (v_lote_id, p_ubic_origen, 0) ON CONFLICT (lote_id, ubicacion_id) DO NOTHING;
    UPDATE public.stock_lote_ubicacion SET cantidad_cajas=GREATEST(cantidad_cajas-v_cantidad,0), updated_at=now()
      WHERE lote_id=v_lote_id AND ubicacion_id=p_ubic_origen;
    INSERT INTO public.stock_lote_ubicacion(lote_id, ubicacion_id, cantidad_cajas)
    VALUES (v_lote_id, p_ubic_destino, v_cantidad)
    ON CONFLICT (lote_id, ubicacion_id) DO UPDATE
      SET cantidad_cajas=public.stock_lote_ubicacion.cantidad_cajas+EXCLUDED.cantidad_cajas, updated_at=now();
  END IF;

  v_certificacion := NULLIF(trim(both ' ' FROM concat_ws(' · ', v_lote.certificadora, to_char(v_lote.fecha_certificacion,'DD-MM-YYYY'))),'');
  v_tiene_etiqueta := COALESCE(p_tiene_etiqueta, m.tiene_etiqueta, v_lote.etiqueta IS NOT NULL AND v_lote.etiqueta <> 'S/E');
  v_etiqueta := CASE WHEN v_tiene_etiqueta THEN COALESCE(NULLIF(v_lote.etiqueta,''), NULLIF(m.etiqueta,''), 'SI') ELSE NULL END;
  v_tiene_warrant := p_nro_warrant IS NOT NULL AND length(trim(p_nro_warrant)) > 0;

  PERFORM set_config('app.bypass_movimientos_block', 'true', true);

  UPDATE public.movimientos
    SET tipo=v_tipo, fecha=v_fecha, lote_id=v_lote_id,
        ubicacion_origen_id=p_ubic_origen, ubicacion_destino_id=p_ubic_destino,
        cantidad_cajas=v_cantidad, latas=p_latas, piso=p_piso,
        nro_guia=NULLIF(trim(COALESCE(p_nro_guia,'')),''),
        nro_vale=NULLIF(trim(COALESCE(p_nro_vale,'')),''),
        cliente_proveedor_id=p_cliente,
        motivo=NULLIF(trim(COALESCE(p_motivo,'')),''),
        observaciones=NULLIF(trim(COALESCE(p_observaciones,'')),''),
        nro_warrant=NULLIF(trim(COALESCE(p_nro_warrant,'')),''),
        tiene_warrant=v_tiene_warrant, mercado=v_lote.mercado,
        certificacion=v_certificacion, etiqueta=v_etiqueta,
        tiene_etiqueta=v_tiene_etiqueta, estado_lote=v_lote.estado,
        mercado_id=COALESCE(p_mercado_id, m.mercado_id),
        tercero=NULLIF(trim(COALESCE(p_tercero, m.tercero, '')),'')
    WHERE id=p_mov;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_editar_movimiento(uuid,tipo_mov_t,date,uuid,uuid,uuid,numeric,integer,integer,text,text,uuid,text,text,text,uuid,boolean,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_editar_movimiento(uuid,tipo_mov_t,date,uuid,uuid,uuid,numeric,integer,integer,text,text,uuid,text,text,text,uuid,boolean,text) TO authenticated, service_role;

-- 6) cambiar_lote: descuenta stock del lote origen y crea/usa lote destino con otro código
CREATE OR REPLACE FUNCTION public.cambiar_lote(
  p_lote_origen uuid,
  p_cantidad numeric,
  p_ubicacion uuid,
  p_latas integer DEFAULT NULL,
  p_producto_destino uuid DEFAULT NULL,
  p_fp_destino date DEFAULT NULL,
  p_fv_destino date DEFAULT NULL,
  p_estado_destino text DEFAULT NULL,
  p_observaciones text DEFAULT NULL,
  p_fecha date DEFAULT CURRENT_DATE
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_origen record; v_dest_id uuid; v_codigo_base text; v_codigo_lote text;
  v_stock numeric; v_user_email text; v_mov_out uuid; v_mov_in uuid;
  v_prod uuid; v_fp date; v_fv date; v_estado text;
BEGIN
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN RAISE EXCEPTION 'Cantidad debe ser mayor a 0'; END IF;
  IF p_ubicacion IS NULL THEN RAISE EXCEPTION 'Ubicación requerida'; END IF;
  SELECT * INTO v_origen FROM public.lotes WHERE id=p_lote_origen;
  IF v_origen IS NULL THEN RAISE EXCEPTION 'Lote origen no existe'; END IF;

  SELECT COALESCE(cantidad_cajas,0) INTO v_stock FROM public.stock_lote_ubicacion
    WHERE lote_id=p_lote_origen AND ubicacion_id=p_ubicacion;
  IF v_stock IS NULL OR v_stock < p_cantidad THEN
    RAISE EXCEPTION 'Stock insuficiente en ubicación. Disponible: %', COALESCE(v_stock,0);
  END IF;

  v_prod := COALESCE(p_producto_destino, v_origen.producto_id);
  v_fp := COALESCE(p_fp_destino, v_origen.fecha_produccion);
  v_fv := COALESCE(p_fv_destino, v_origen.fecha_vencimiento);
  v_estado := COALESCE(NULLIF(p_estado_destino,''), v_origen.estado, 'DISPONIBLE');

  IF v_prod = v_origen.producto_id AND v_fp = v_origen.fecha_produccion AND v_fv = v_origen.fecha_vencimiento THEN
    RAISE EXCEPTION 'El lote destino es idéntico al origen. Cambia producto, FP o FV.';
  END IF;

  SELECT id INTO v_dest_id FROM public.lotes
   WHERE producto_id=v_prod AND fecha_produccion=v_fp AND fecha_vencimiento=v_fv;
  IF v_dest_id IS NULL THEN
    SELECT codigo_base INTO v_codigo_base FROM public.productos WHERE id=v_prod;
    IF v_codigo_base IS NULL THEN RAISE EXCEPTION 'Producto destino no existe'; END IF;
    v_codigo_lote := v_codigo_base || ' FP:' || to_char(v_fp,'DD-MM-YYYY') || ' FV:' || to_char(v_fv,'DD-MM-YYYY');
    INSERT INTO public.lotes(producto_id, fecha_produccion, fecha_vencimiento, codigo_lote, estado, mercado, costo_por_caja)
    VALUES (v_prod, v_fp, v_fv, v_codigo_lote, v_estado, v_origen.mercado, v_origen.costo_por_caja)
    RETURNING id INTO v_dest_id;
  END IF;

  -- Descuenta origen
  UPDATE public.stock_lote_ubicacion SET cantidad_cajas=cantidad_cajas-p_cantidad, updated_at=now()
    WHERE lote_id=p_lote_origen AND ubicacion_id=p_ubicacion;
  -- Ingresa destino
  INSERT INTO public.stock_lote_ubicacion(lote_id, ubicacion_id, cantidad_cajas)
  VALUES (v_dest_id, p_ubicacion, p_cantidad)
  ON CONFLICT (lote_id, ubicacion_id) DO UPDATE
    SET cantidad_cajas=public.stock_lote_ubicacion.cantidad_cajas+p_cantidad, updated_at=now();

  SELECT email INTO v_user_email FROM auth.users WHERE id=auth.uid();

  INSERT INTO public.movimientos(
    tipo, fecha, lote_id, ubicacion_origen_id, cantidad_cajas, latas,
    motivo, observaciones, usuario_id, usuario_nombre, estado_lote, mercado
  ) VALUES (
    'CAMBIO', p_fecha, p_lote_origen, p_ubicacion, p_cantidad, p_latas,
    'CAMBIO DE LOTE → ' || (SELECT codigo_lote FROM public.lotes WHERE id=v_dest_id),
    p_observaciones, auth.uid(), v_user_email, v_origen.estado, v_origen.mercado
  ) RETURNING id INTO v_mov_out;

  INSERT INTO public.movimientos(
    tipo, fecha, lote_id, ubicacion_destino_id, cantidad_cajas, latas,
    motivo, observaciones, usuario_id, usuario_nombre, estado_lote, mercado
  ) VALUES (
    'CAMBIO', p_fecha, v_dest_id, p_ubicacion, p_cantidad, p_latas,
    'CAMBIO DE LOTE ← ' || v_origen.codigo_lote,
    p_observaciones, auth.uid(), v_user_email, v_estado, v_origen.mercado
  ) RETURNING id INTO v_mov_in;

  RETURN v_dest_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.cambiar_lote(uuid,numeric,uuid,integer,uuid,date,date,text,text,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cambiar_lote(uuid,numeric,uuid,integer,uuid,date,date,text,text,date) TO authenticated, service_role;
