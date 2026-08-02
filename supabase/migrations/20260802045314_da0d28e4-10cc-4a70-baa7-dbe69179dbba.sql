CREATE OR REPLACE FUNCTION public.admin_editar_insumo_mov(
  p_mov uuid, p_fecha date, p_insumo_id uuid, p_tipo public.tipo_mov_insumo_t,
  p_cantidad numeric, p_nro_guia text, p_vale_num text, p_proveedor text,
  p_transportista text, p_observacion text, p_saldo_post numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_clase text;
BEGIN
  IF NOT (public.has_role(auth.uid(),'ADMIN') OR public.has_role(auth.uid(),'INSUMOS')) THEN
    RAISE EXCEPTION 'Solo ADMIN o INSUMOS';
  END IF;
  IF p_cantidad IS NULL OR p_cantidad < 0 THEN
    RAISE EXCEPTION 'Cantidad inválida';
  END IF;

  v_clase := CASE
    WHEN p_tipo IN ('INGRESO_GUIA','STOCK_INICIAL','DEVOLUCION','AJUSTE_POS') THEN 'INGRESO'
    ELSE 'SALIDA'
  END;

  PERFORM set_config('app.bypass_movimientos_block','true', true);
  UPDATE public.insumos_movimientos
  SET fecha = COALESCE(p_fecha, fecha),
      insumo_id = COALESCE(p_insumo_id, insumo_id),
      tipo_mov = COALESCE(p_tipo, tipo_mov),
      clase = v_clase,
      cantidad = p_cantidad,
      nro_guia = NULLIF(trim(COALESCE(p_nro_guia,'')),''),
      vale_num = NULLIF(trim(COALESCE(p_vale_num,'')),''),
      proveedor = NULLIF(trim(COALESCE(p_proveedor,'')),''),
      transportista = NULLIF(trim(COALESCE(p_transportista,'')),''),
      observacion = NULLIF(trim(COALESCE(p_observacion,'')),'')
  WHERE id = p_mov;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Movimiento no encontrado';
  END IF;
END
$function$;

REVOKE ALL ON FUNCTION public.admin_editar_insumo_mov(uuid,date,uuid,public.tipo_mov_insumo_t,numeric,text,text,text,text,text,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_editar_insumo_mov(uuid,date,uuid,public.tipo_mov_insumo_t,numeric,text,text,text,text,text,numeric) TO authenticated, service_role;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'insumos_movimientos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.insumos_movimientos;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'insumos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.insumos;
  END IF;
END
$do$;

-- Verificación y reparación idempotente de toda la cadena histórica.
DO $do$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.insumos LOOP
    PERFORM public.recalc_saldos_insumo(r.id);
  END LOOP;
END
$do$;