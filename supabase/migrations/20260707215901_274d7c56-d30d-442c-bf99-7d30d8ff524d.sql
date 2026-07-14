
-- Función que recalcula el stock para pares (lote, ubicacion) afectados
CREATE OR REPLACE FUNCTION public.recalc_stock_lote_ubic(p_lote uuid, p_ubic uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_neto numeric;
BEGIN
  IF p_lote IS NULL OR p_ubic IS NULL THEN RETURN; END IF;
  SELECT COALESCE(SUM(
    CASE
      WHEN tipo IN ('ENTRADA','AJUSTE_POSITIVO') AND ubicacion_destino_id = p_ubic THEN cantidad_cajas
      WHEN tipo IN ('SALIDA','MERMA','AJUSTE_NEGATIVO') AND ubicacion_origen_id = p_ubic THEN -cantidad_cajas
      WHEN tipo IN ('TRASLADO','CAMBIO') AND ubicacion_destino_id = p_ubic THEN cantidad_cajas
      WHEN tipo IN ('TRASLADO','CAMBIO') AND ubicacion_origen_id = p_ubic THEN -cantidad_cajas
      ELSE 0
    END
  ),0) INTO v_neto
  FROM public.movimientos
  WHERE lote_id = p_lote
    AND (ubicacion_origen_id = p_ubic OR ubicacion_destino_id = p_ubic);

  IF v_neto <= 0 THEN
    DELETE FROM public.stock_lote_ubicacion WHERE lote_id = p_lote AND ubicacion_id = p_ubic;
  ELSE
    INSERT INTO public.stock_lote_ubicacion(lote_id, ubicacion_id, cantidad_cajas)
    VALUES (p_lote, p_ubic, v_neto)
    ON CONFLICT (lote_id, ubicacion_id)
    DO UPDATE SET cantidad_cajas = EXCLUDED.cantidad_cajas, updated_at = now();
  END IF;
END $$;

-- Trigger que sincroniza stock tras cualquier cambio en movimientos
CREATE OR REPLACE FUNCTION public.tg_sync_stock_from_mov()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP IN ('INSERT','UPDATE') THEN
    PERFORM public.recalc_stock_lote_ubic(NEW.lote_id, NEW.ubicacion_origen_id);
    PERFORM public.recalc_stock_lote_ubic(NEW.lote_id, NEW.ubicacion_destino_id);
  END IF;
  IF TG_OP IN ('UPDATE','DELETE') THEN
    PERFORM public.recalc_stock_lote_ubic(OLD.lote_id, OLD.ubicacion_origen_id);
    PERFORM public.recalc_stock_lote_ubic(OLD.lote_id, OLD.ubicacion_destino_id);
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_sync_stock_from_mov ON public.movimientos;
CREATE TRIGGER trg_sync_stock_from_mov
AFTER INSERT OR UPDATE OR DELETE ON public.movimientos
FOR EACH ROW EXECUTE FUNCTION public.tg_sync_stock_from_mov();

-- Reconstrucción completa del stock a partir del historial
WITH neto AS (
  SELECT lote_id, ubic AS ubicacion_id, SUM(delta) AS cant
  FROM (
    SELECT lote_id, ubicacion_destino_id AS ubic, cantidad_cajas AS delta
      FROM public.movimientos
      WHERE tipo IN ('ENTRADA','AJUSTE_POSITIVO','TRASLADO','CAMBIO')
        AND ubicacion_destino_id IS NOT NULL
    UNION ALL
    SELECT lote_id, ubicacion_origen_id AS ubic, -cantidad_cajas AS delta
      FROM public.movimientos
      WHERE tipo IN ('SALIDA','MERMA','AJUSTE_NEGATIVO','TRASLADO','CAMBIO')
        AND ubicacion_origen_id IS NOT NULL
  ) x
  GROUP BY lote_id, ubic
),
upsert AS (
  INSERT INTO public.stock_lote_ubicacion(lote_id, ubicacion_id, cantidad_cajas)
  SELECT lote_id, ubicacion_id, cant FROM neto WHERE cant > 0
  ON CONFLICT (lote_id, ubicacion_id)
  DO UPDATE SET cantidad_cajas = EXCLUDED.cantidad_cajas, updated_at = now()
  RETURNING lote_id, ubicacion_id
)
SELECT 1;

-- Elimina cualquier saldo huérfano que no exista o sea <= 0 en el neto
DELETE FROM public.stock_lote_ubicacion s
WHERE NOT EXISTS (
  SELECT 1 FROM (
    SELECT lote_id, ubic AS ubicacion_id, SUM(delta) AS cant
    FROM (
      SELECT lote_id, ubicacion_destino_id AS ubic, cantidad_cajas AS delta
        FROM public.movimientos
        WHERE tipo IN ('ENTRADA','AJUSTE_POSITIVO','TRASLADO','CAMBIO')
          AND ubicacion_destino_id IS NOT NULL
      UNION ALL
      SELECT lote_id, ubicacion_origen_id AS ubic, -cantidad_cajas AS delta
        FROM public.movimientos
        WHERE tipo IN ('SALIDA','MERMA','AJUSTE_NEGATIVO','TRASLADO','CAMBIO')
          AND ubicacion_origen_id IS NOT NULL
    ) x GROUP BY lote_id, ubic
  ) n
  WHERE n.lote_id = s.lote_id AND n.ubicacion_id = s.ubicacion_id AND n.cant > 0
);
