
DROP VIEW IF EXISTS public.vista_insumos_stock;
ALTER TABLE public.insumos RENAME COLUMN proveedor TO provee;

CREATE VIEW public.vista_insumos_stock
WITH (security_invoker = true) AS
WITH agg AS (
  SELECT insumo_id,
    COALESCE(sum(CASE WHEN clase='INGRESO' THEN cantidad ELSE 0 END),0) AS ingresos,
    COALESCE(sum(CASE WHEN clase='SALIDA'  THEN cantidad ELSE 0 END),0) AS salidas,
    max(fecha) AS ult_mov
  FROM public.insumos_movimientos
  GROUP BY insumo_id
)
SELECT i.id, i.codigo, i.categoria, i.grupo, i.subcategoria,
  i.provee,
  i.insumo, i.formato, i.empaque, i.und_x_empaque, i.unidad,
  i.stock_min_und, i.saldo_inicial, i.activo, i.descripcion,
  COALESCE(a.ingresos,0) AS ingresos,
  COALESCE(a.salidas,0) AS salidas,
  i.saldo_inicial + COALESCE(a.ingresos,0) - COALESCE(a.salidas,0) AS saldo_und,
  round((i.saldo_inicial + COALESCE(a.ingresos,0) - COALESCE(a.salidas,0)) / NULLIF(i.und_x_empaque,0), 2) AS saldo_emp,
  a.ult_mov,
  CASE
    WHEN (i.saldo_inicial + COALESCE(a.ingresos,0) - COALESCE(a.salidas,0)) <= 0 THEN 'AGOTADO'
    WHEN (i.saldo_inicial + COALESCE(a.ingresos,0) - COALESCE(a.salidas,0)) <= i.stock_min_und THEN 'BAJO'
    ELSE 'OK'
  END AS estado
FROM public.insumos i
LEFT JOIN agg a ON a.insumo_id = i.id;

GRANT SELECT ON public.vista_insumos_stock TO authenticated;
GRANT ALL ON public.vista_insumos_stock TO service_role;
