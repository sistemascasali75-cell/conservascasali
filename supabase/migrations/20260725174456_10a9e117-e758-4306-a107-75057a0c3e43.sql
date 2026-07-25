CREATE OR REPLACE FUNCTION public.registrar_movimiento(
  p_tipo tipo_mov_t, p_lote_id uuid, p_cantidad numeric DEFAULT 0,
  p_ubic_origen uuid DEFAULT NULL, p_ubic_destino uuid DEFAULT NULL,
  p_cliente_proveedor uuid DEFAULT NULL, p_nro_guia text DEFAULT NULL,
  p_nro_vale text DEFAULT NULL, p_motivo text DEFAULT NULL,
  p_fecha date DEFAULT ((now() AT TIME ZONE 'America/Lima')::date),
  p_observaciones text DEFAULT NULL, p_nro_warrant text DEFAULT NULL,
  p_latas integer DEFAULT NULL, p_piso integer DEFAULT NULL,
  p_mercado_id uuid DEFAULT NULL, p_tiene_etiqueta boolean DEFAULT NULL,
  p_tercero text DEFAULT NULL, p_empaque integer DEFAULT 48,
  p_donacion boolean DEFAULT false, p_autorizado text DEFAULT NULL,
  p_inicia_warrant date DEFAULT NULL, p_vence_warrant date DEFAULT NULL,
  p_total_latas integer DEFAULT NULL, p_tamano text DEFAULT NULL,
  p_estado_lote text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public' SET "TimeZone" TO 'America/Lima'
AS $function$
DECLARE
  v_stock_latas integer; v_warrant_latas integer; v_total_lote_latas integer; v_mov_id uuid;
  v_lote record; v_certificacion text; v_tiene_warrant boolean;
  v_tiene_etiqueta boolean; v_etiqueta text; v_user_email text;
  v_empaque integer; v_total integer; v_cajas numeric; v_latas_sueltas integer;
  v_estado_final text;
BEGIN
  v_empaque := GREATEST(COALESCE(p_empaque, 48), 1);
  IF p_total_latas IS NOT NULL AND p_total_latas > 0 THEN
    v_total := p_total_latas;
  ELSE
    v_total := COALESCE(p_cantidad,0)::integer * v_empaque + COALESCE(p_latas,0);
  END IF;
  v_cajas := v_total / v_empaque;
  v_latas_sueltas := v_total % v_empaque;

  IF v_total < 0 THEN RAISE EXCEPTION 'Total de latas no puede ser negativo'; END IF;
  IF p_tipo IN ('SALIDA','MERMA','AJUSTE_NEGATIVO','TRASLADO','CAMBIO') AND p_ubic_origen IS NULL THEN
    RAISE EXCEPTION 'Ubicación origen requerida'; END IF;
  IF p_tipo IN ('ENTRADA','AJUSTE_POSITIVO','TRASLADO') AND p_ubic_destino IS NULL THEN
    RAISE EXCEPTION 'Ubicación destino requerida'; END IF;

  SELECT * INTO v_lote FROM public.lotes WHERE id = p_lote_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lote no encontrado'; END IF;

  -- Si se pide cambiar el estado del lote, actualizarlo primero
  IF p_estado_lote IS NOT NULL AND length(trim(p_estado_lote)) > 0 AND p_estado_lote <> v_lote.estado THEN
    UPDATE public.lotes SET estado = p_estado_lote WHERE id = p_lote_id;
    v_estado_final := p_estado_lote;
  ELSE
    v_estado_final := v_lote.estado;
  END IF;

  v_certificacion := NULLIF(trim(both ' ' FROM concat_ws(' · ', v_lote.certificadora, to_char(v_lote.fecha_certificacion, 'DD-MM-YYYY'))), '');
  v_tiene_warrant := (p_nro_warrant IS NOT NULL AND length(trim(p_nro_warrant)) > 0);
  v_tiene_etiqueta := COALESCE(p_tiene_etiqueta, false);
  v_etiqueta := CASE WHEN v_tiene_etiqueta THEN COALESCE(NULLIF(v_lote.etiqueta, ''), 'CON ETIQUETA') ELSE NULL END;

  SELECT COALESCE(email, '') INTO v_user_email FROM auth.users WHERE id = auth.uid();

  IF p_tipo IN ('SALIDA','TRASLADO','CAMBIO','MERMA','AJUSTE_NEGATIVO') AND v_total > 0 THEN
    SELECT COALESCE(SUM(total_latas), 0) INTO v_stock_latas
      FROM public.stock_lote_ubicacion WHERE lote_id = p_lote_id AND ubicacion_id = p_ubic_origen;
    IF COALESCE(v_stock_latas, 0) < v_total THEN
      RAISE EXCEPTION 'Stock insuficiente en ubicación origen (% latas disponibles)', COALESCE(v_stock_latas, 0);
    END IF;
    SELECT COALESCE(SUM(total_latas), 0) INTO v_total_lote_latas
      FROM public.stock_lote_ubicacion WHERE lote_id = p_lote_id;
    SELECT COALESCE(SUM(total_latas_warrant), 0) INTO v_warrant_latas
      FROM public.warrants WHERE lote_id = p_lote_id AND estado = 'ACTIVO';
    IF (COALESCE(v_total_lote_latas, 0) - v_total) < COALESCE(v_warrant_latas, 0) THEN
      RAISE EXCEPTION 'No se puede mover: lote tiene % latas en warrant activo', COALESCE(v_warrant_latas, 0);
    END IF;
  END IF;

  INSERT INTO public.movimientos (
    tipo, fecha, lote_id, ubicacion_origen_id, ubicacion_destino_id,
    cantidad_cajas, latas, total_latas, piso, cliente_proveedor_id, mercado_id,
    nro_guia, nro_vale, nro_warrant, tiene_warrant, motivo, observaciones,
    usuario_id, usuario_nombre, tiene_etiqueta, etiqueta, certificacion,
    estado_lote, tercero, empaque, donacion, autorizado,
    inicia_warrant, vence_warrant, tamano
  ) VALUES (
    p_tipo, COALESCE(p_fecha, ((now() AT TIME ZONE 'America/Lima')::date)),
    p_lote_id, p_ubic_origen, p_ubic_destino, v_cajas, v_latas_sueltas, v_total,
    p_piso, p_cliente_proveedor, p_mercado_id,
    NULLIF(trim(COALESCE(p_nro_guia, '')), ''),
    NULLIF(trim(COALESCE(p_nro_vale, '')), ''),
    NULLIF(trim(COALESCE(p_nro_warrant, '')), ''),
    v_tiene_warrant,
    NULLIF(trim(COALESCE(p_motivo, '')), ''),
    NULLIF(trim(COALESCE(p_observaciones, '')), ''),
    auth.uid(), v_user_email, v_tiene_etiqueta, v_etiqueta, v_certificacion,
    v_estado_final, NULLIF(trim(COALESCE(p_tercero, '')), ''),
    v_empaque, COALESCE(p_donacion, false),
    NULLIF(trim(COALESCE(p_autorizado, '')), ''),
    p_inicia_warrant, p_vence_warrant,
    NULLIF(trim(COALESCE(p_tamano, '')), '')
  ) RETURNING id INTO v_mov_id;

  RETURN v_mov_id;
END $function$;

REVOKE EXECUTE ON FUNCTION public.registrar_movimiento(tipo_mov_t, uuid, numeric, uuid, uuid, uuid, text, text, text, date, text, text, integer, integer, uuid, boolean, text, integer, boolean, text, date, date, integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_movimiento(tipo_mov_t, uuid, numeric, uuid, uuid, uuid, text, text, text, date, text, text, integer, integer, uuid, boolean, text, integer, boolean, text, date, date, integer, text, text) TO authenticated;