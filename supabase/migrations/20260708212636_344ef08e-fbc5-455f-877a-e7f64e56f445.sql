CREATE OR REPLACE VIEW public.v_stock_latas_ubic
WITH (security_invoker = on) AS
SELECT lote_id, ubicacion_id, SUM(latas)::bigint AS latas
FROM (
  SELECT lote_id, ubicacion_destino_id AS ubicacion_id, COALESCE(latas,0) AS latas
    FROM public.movimientos
   WHERE tipo IN ('ENTRADA','AJUSTE_POSITIVO') AND ubicacion_destino_id IS NOT NULL
  UNION ALL
  SELECT lote_id, ubicacion_origen_id, -COALESCE(latas,0)
    FROM public.movimientos
   WHERE tipo IN ('SALIDA','MERMA','AJUSTE_NEGATIVO') AND ubicacion_origen_id IS NOT NULL
  UNION ALL
  SELECT lote_id, ubicacion_destino_id, COALESCE(latas,0)
    FROM public.movimientos
   WHERE tipo IN ('TRASLADO','CAMBIO') AND ubicacion_destino_id IS NOT NULL
  UNION ALL
  SELECT lote_id, ubicacion_origen_id, -COALESCE(latas,0)
    FROM public.movimientos
   WHERE tipo IN ('TRASLADO','CAMBIO') AND ubicacion_origen_id IS NOT NULL
) t
GROUP BY lote_id, ubicacion_id
HAVING SUM(latas) <> 0;

GRANT SELECT ON public.v_stock_latas_ubic TO authenticated;
GRANT SELECT ON public.v_stock_latas_ubic TO service_role;