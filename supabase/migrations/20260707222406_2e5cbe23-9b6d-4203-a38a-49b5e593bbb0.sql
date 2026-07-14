
-- 1) Reescribir registrar_movimiento: NO tocar stock_lote_ubicacion directamente.
--    El trigger trg_sync_stock_from_mov recalcula el stock desde movimientos.
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
  p_inicia_warrant date DEFAULT NULL, p_vence_warrant date DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' SET "TimeZone" = 'America/Lima'
AS $function$
DECLARE
  v_stock numeric; v_warrant numeric; v_total_lote numeric; v_mov_id uuid;
  v_lote record; v_certificacion text; v_tiene_warrant boolean;
  v_tiene_etiqueta boolean; v_etiqueta text; v_user_email text; v_mercado public.mercado_t;
BEGIN
  IF p_cantidad IS NULL OR p_cantidad < 0 THEN RAISE EXCEPTION 'La cantidad de cajas no puede ser negativa'; END IF;
  IF p_latas IS NOT NULL AND p_latas < 0 THEN RAISE EXCEPTION 'Latas debe ser mayor o igual a 0'; END IF;
  IF p_tipo IN ('SALIDA','MERMA','AJUSTE_NEGATIVO','TRASLADO','CAMBIO') AND p_ubic_origen IS NULL THEN
    RAISE EXCEPTION 'Ubicación origen requerida'; END IF;
  IF p_tipo IN ('ENTRADA','AJUSTE_POSITIVO','TRASLADO') AND p_ubic_destino IS NULL THEN
    RAISE EXCEPTION 'Ubicación destino requerida'; END IF;

  SELECT * INTO v_lote FROM public.lotes WHERE id = p_lote_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lote no encontrado'; END IF;

  v_certificacion := NULLIF(trim(both ' ' FROM concat_ws(' · ', v_lote.certificadora, to_char(v_lote.fecha_certificacion, 'DD-MM-YYYY'))), '');
  v_tiene_warrant := (p_nro_warrant IS NOT NULL AND length(trim(p_nro_warrant)) > 0);
  v_tiene_etiqueta := COALESCE(p_tiene_etiqueta, false);
  v_etiqueta := CASE WHEN v_tiene_etiqueta THEN COALESCE(NULLIF(v_lote.etiqueta, ''), 'CON ETIQUETA') ELSE NULL END;
  v_mercado := v_lote.mercado;

  SELECT COALESCE(email, '') INTO v_user_email FROM auth.users WHERE id = auth.uid();

  IF p_tipo IN ('SALIDA','TRASLADO','CAMBIO','MERMA','AJUSTE_NEGATIVO') AND p_cantidad > 0 THEN
    SELECT COALESCE(SUM(cantidad_cajas), 0) INTO v_stock
      FROM public.stock_lote_ubicacion WHERE lote_id = p_lote_id AND ubicacion_id = p_ubic_origen;
    IF COALESCE(v_stock, 0) < p_cantidad THEN
      RAISE EXCEPTION 'Stock insuficiente en ubicación origen (% disponibles)', COALESCE(v_stock, 0);
    END IF;
    SELECT COALESCE(SUM(cantidad_cajas), 0) INTO v_total_lote
      FROM public.stock_lote_ubicacion WHERE lote_id = p_lote_id;
    SELECT COALESCE(SUM(cantidad_cajas_warrant), 0) INTO v_warrant
      FROM public.warrants WHERE lote_id = p_lote_id AND estado = 'ACTIVO';
    IF (COALESCE(v_total_lote, 0) - p_cantidad) < COALESCE(v_warrant, 0) THEN
      RAISE EXCEPTION 'No se puede mover: lote tiene % cajas en warrant activo', COALESCE(v_warrant, 0);
    END IF;
  END IF;

  INSERT INTO public.movimientos (
    tipo, fecha, lote_id, ubicacion_origen_id, ubicacion_destino_id,
    cantidad_cajas, latas, piso, cliente_proveedor_id, mercado_id,
    nro_guia, nro_vale, nro_warrant, tiene_warrant, motivo, observaciones,
    usuario_id, usuario_nombre, tiene_etiqueta, etiqueta, certificacion,
    estado_lote, mercado, tercero, empaque, donacion, autorizado,
    inicia_warrant, vence_warrant
  ) VALUES (
    p_tipo, COALESCE(p_fecha, ((now() AT TIME ZONE 'America/Lima')::date)),
    p_lote_id, p_ubic_origen, p_ubic_destino, p_cantidad, COALESCE(p_latas, 0),
    p_piso, p_cliente_proveedor, p_mercado_id,
    NULLIF(trim(COALESCE(p_nro_guia, '')), ''),
    NULLIF(trim(COALESCE(p_nro_vale, '')), ''),
    NULLIF(trim(COALESCE(p_nro_warrant, '')), ''),
    v_tiene_warrant,
    NULLIF(trim(COALESCE(p_motivo, '')), ''),
    NULLIF(trim(COALESCE(p_observaciones, '')), ''),
    auth.uid(), v_user_email, v_tiene_etiqueta, v_etiqueta, v_certificacion,
    v_lote.estado, v_mercado,
    NULLIF(trim(COALESCE(p_tercero, '')), ''),
    COALESCE(p_empaque, 48),
    COALESCE(p_donacion, false),
    NULLIF(trim(COALESCE(p_autorizado, '')), ''),
    p_inicia_warrant, p_vence_warrant
  ) RETURNING id INTO v_mov_id;

  -- El trigger trg_sync_stock_from_mov recalcula stock_lote_ubicacion.
  RETURN v_mov_id;
END;
$function$;

-- 2) Reconciliar TODO el stock desde el kardex (fuente única de verdad).
WITH neto AS (
  SELECT lote_id, ubic_id, SUM(qty) AS cajas FROM (
    SELECT lote_id, ubicacion_destino_id AS ubic_id, cantidad_cajas AS qty
      FROM public.movimientos
      WHERE tipo IN ('ENTRADA','AJUSTE_POSITIVO','TRASLADO','CAMBIO')
        AND ubicacion_destino_id IS NOT NULL
    UNION ALL
    SELECT lote_id, ubicacion_origen_id AS ubic_id, -cantidad_cajas AS qty
      FROM public.movimientos
      WHERE tipo IN ('SALIDA','MERMA','AJUSTE_NEGATIVO','TRASLADO','CAMBIO')
        AND ubicacion_origen_id IS NOT NULL
  ) x
  WHERE lote_id IS NOT NULL AND ubic_id IS NOT NULL
  GROUP BY lote_id, ubic_id
)
INSERT INTO public.stock_lote_ubicacion (lote_id, ubicacion_id, cantidad_cajas)
SELECT lote_id, ubic_id, cajas FROM neto WHERE cajas > 0
ON CONFLICT (lote_id, ubicacion_id)
DO UPDATE SET cantidad_cajas = EXCLUDED.cantidad_cajas, updated_at = now();

DELETE FROM public.stock_lote_ubicacion s
WHERE NOT EXISTS (
  SELECT 1 FROM (
    SELECT lote_id, ubic_id, SUM(qty) AS cajas FROM (
      SELECT lote_id, ubicacion_destino_id AS ubic_id, cantidad_cajas AS qty
        FROM public.movimientos
        WHERE tipo IN ('ENTRADA','AJUSTE_POSITIVO','TRASLADO','CAMBIO')
          AND ubicacion_destino_id IS NOT NULL
      UNION ALL
      SELECT lote_id, ubicacion_origen_id AS ubic_id, -cantidad_cajas AS qty
        FROM public.movimientos
        WHERE tipo IN ('SALIDA','MERMA','AJUSTE_NEGATIVO','TRASLADO','CAMBIO')
          AND ubicacion_origen_id IS NOT NULL
    ) x
    WHERE lote_id IS NOT NULL AND ubic_id IS NOT NULL
    GROUP BY lote_id, ubic_id
    HAVING SUM(qty) > 0
  ) n
  WHERE n.lote_id = s.lote_id AND n.ubic_id = s.ubicacion_id
);
