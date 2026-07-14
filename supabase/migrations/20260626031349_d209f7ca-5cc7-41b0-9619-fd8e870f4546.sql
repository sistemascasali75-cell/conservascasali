-- Cambiar default de p_fecha a hora regional Lima Perú
CREATE OR REPLACE FUNCTION public.registrar_movimiento(
  p_tipo public.tipo_mov_t,
  p_lote_id uuid,
  p_cantidad numeric,
  p_ubic_origen uuid DEFAULT NULL::uuid,
  p_ubic_destino uuid DEFAULT NULL::uuid,
  p_cliente_proveedor uuid DEFAULT NULL::uuid,
  p_nro_guia text DEFAULT NULL::text,
  p_nro_vale text DEFAULT NULL::text,
  p_motivo text DEFAULT NULL::text,
  p_fecha date DEFAULT (now() AT TIME ZONE 'America/Lima')::date,
  p_observaciones text DEFAULT NULL::text,
  p_nro_warrant text DEFAULT NULL::text,
  p_latas integer DEFAULT NULL::integer,
  p_piso integer DEFAULT NULL::integer,
  p_mercado_id uuid DEFAULT NULL::uuid,
  p_tiene_etiqueta boolean DEFAULT NULL::boolean,
  p_tercero text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET timezone TO 'America/Lima'
AS $fn$
DECLARE
  v_stock numeric;
  v_warrant numeric;
  v_total_lote numeric;
  v_mov_id uuid;
  v_lote record;
  v_certificacion text;
  v_tiene_warrant boolean;
  v_tiene_etiqueta boolean;
  v_etiqueta text;
  v_user_email text;
BEGIN
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN
    RAISE EXCEPTION 'La cantidad debe ser mayor a 0';
  END IF;

  SELECT * INTO v_lote FROM public.lotes WHERE id = p_lote_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lote no encontrado'; END IF;

  v_certificacion := NULLIF(trim(both ' ' FROM concat_ws(' · ', v_lote.certificadora, to_char(v_lote.fecha_certificacion, 'DD-MM-YYYY'))), '');
  v_tiene_warrant := (p_nro_warrant IS NOT NULL AND length(trim(p_nro_warrant)) > 0);
  v_tiene_etiqueta := COALESCE(p_tiene_etiqueta, false);
  v_etiqueta := CASE WHEN v_tiene_etiqueta THEN 'CON ETIQUETA' ELSE 'SIN ETIQUETA' END;

  SELECT COALESCE(email, '') INTO v_user_email FROM auth.users WHERE id = auth.uid();

  IF p_tipo IN ('SALIDA','TRASLADO','CAMBIO','MERMA','AJUSTE_NEGATIVO') THEN
    SELECT COALESCE(SUM(cantidad_cajas), 0) INTO v_stock FROM public.stock_lote_ubicacion WHERE lote_id = p_lote_id AND ubicacion_id = p_ubic_origen;
    IF v_stock < p_cantidad THEN RAISE EXCEPTION 'Stock insuficiente en ubicación origen (% disponibles)', v_stock; END IF;

    SELECT COALESCE(SUM(cantidad_cajas), 0) INTO v_total_lote FROM public.stock_lote_ubicacion WHERE lote_id = p_lote_id;
    SELECT COALESCE(SUM(cantidad_cajas_warrant), 0) INTO v_warrant FROM public.warrants WHERE lote_id = p_lote_id AND estado = 'ACTIVO';
    IF (v_total_lote - p_cantidad) < v_warrant THEN RAISE EXCEPTION 'No se puede mover: lote tiene % cajas en warrant activo', v_warrant; END IF;
  END IF;

  INSERT INTO public.movimientos (
    tipo, fecha, lote_id, ubicacion_origen_id, ubicacion_destino_id,
    cantidad_cajas, latas, piso, cliente_proveedor_id, mercado_id,
    nro_guia, nro_vale, nro_warrant, motivo, observaciones,
    tiene_etiqueta, etiqueta, certificacion, tercero, usuario, created_by
  ) VALUES (
    p_tipo, p_fecha, p_lote_id, p_ubic_origen, p_ubic_destino,
    p_cantidad, p_latas, p_piso, p_cliente_proveedor, p_mercado_id,
    p_nro_guia, p_nro_vale, p_nro_warrant, p_motivo, p_observaciones,
    v_tiene_etiqueta, v_etiqueta, v_certificacion, p_tercero, v_user_email, auth.uid()
  ) RETURNING id INTO v_mov_id;

  IF p_tipo IN ('SALIDA','MERMA','AJUSTE_NEGATIVO') THEN
    UPDATE public.stock_lote_ubicacion SET cantidad_cajas = cantidad_cajas - p_cantidad WHERE lote_id = p_lote_id AND ubicacion_id = p_ubic_origen;
  ELSIF p_tipo = 'ENTRADA' OR p_tipo = 'AJUSTE_POSITIVO' THEN
    INSERT INTO public.stock_lote_ubicacion (lote_id, ubicacion_id, cantidad_cajas)
    VALUES (p_lote_id, p_ubic_destino, p_cantidad)
    ON CONFLICT (lote_id, ubicacion_id) DO UPDATE SET cantidad_cajas = public.stock_lote_ubicacion.cantidad_cajas + EXCLUDED.cantidad_cajas;
  ELSIF p_tipo IN ('TRASLADO','CAMBIO') THEN
    UPDATE public.stock_lote_ubicacion SET cantidad_cajas = cantidad_cajas - p_cantidad WHERE lote_id = p_lote_id AND ubicacion_id = p_ubic_origen;
    IF p_ubic_destino IS NOT NULL THEN
      INSERT INTO public.stock_lote_ubicacion (lote_id, ubicacion_id, cantidad_cajas)
      VALUES (p_lote_id, p_ubic_destino, p_cantidad)
      ON CONFLICT (lote_id, ubicacion_id) DO UPDATE SET cantidad_cajas = public.stock_lote_ubicacion.cantidad_cajas + EXCLUDED.cantidad_cajas;
    END IF;
  END IF;

  DELETE FROM public.stock_lote_ubicacion WHERE cantidad_cajas <= 0;

  RETURN v_mov_id;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.registrar_movimiento(public.tipo_mov_t, uuid, numeric, uuid, uuid, uuid, text, text, text, date, text, text, integer, integer, uuid, boolean, text) TO authenticated, service_role;