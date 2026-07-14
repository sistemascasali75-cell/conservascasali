
-- 1) Add grupo column
ALTER TABLE public.insumos ADD COLUMN IF NOT EXISTS grupo TEXT NOT NULL DEFAULT 'GENERAL';
ALTER TABLE public.insumos DROP CONSTRAINT IF EXISTS uq_insumos_cat_sub;
DROP INDEX IF EXISTS uq_insumos_cat_sub;
ALTER TABLE public.insumos ADD CONSTRAINT uq_insumos_cat_grupo_sub UNIQUE (categoria, grupo, subcategoria);

-- 2) Relax cantidad check to allow zero (for ajuste/saldo snapshots)
ALTER TABLE public.insumos_movimientos DROP CONSTRAINT IF EXISTS insumos_movimientos_cantidad_check;
ALTER TABLE public.insumos_movimientos ADD CONSTRAINT insumos_movimientos_cantidad_check CHECK (cantidad >= 0);

-- 3) Recreate views with grupo
DROP VIEW IF EXISTS public.vista_insumos_movimientos;
DROP VIEW IF EXISTS public.vista_insumos_stock;

CREATE VIEW public.vista_insumos_stock AS
WITH agg AS (
  SELECT insumo_id,
    COALESCE(sum(CASE WHEN clase='INGRESO' THEN cantidad ELSE 0 END),0) AS ingresos,
    COALESCE(sum(CASE WHEN clase='SALIDA' THEN cantidad ELSE 0 END),0) AS salidas,
    MAX(fecha) AS ult_mov
  FROM public.insumos_movimientos GROUP BY insumo_id
)
SELECT i.id, i.codigo, i.categoria, i.grupo, i.subcategoria, i.proveedor, i.insumo,
  i.formato, i.empaque, i.und_x_empaque, i.unidad, i.stock_min_und, i.saldo_inicial,
  i.activo, i.descripcion,
  COALESCE(a.ingresos,0) AS ingresos, COALESCE(a.salidas,0) AS salidas,
  (i.saldo_inicial + COALESCE(a.ingresos,0) - COALESCE(a.salidas,0)) AS saldo_und,
  ROUND((i.saldo_inicial + COALESCE(a.ingresos,0) - COALESCE(a.salidas,0)) / NULLIF(i.und_x_empaque,0), 2) AS saldo_emp,
  a.ult_mov,
  CASE
    WHEN (i.saldo_inicial + COALESCE(a.ingresos,0) - COALESCE(a.salidas,0)) <= 0 THEN 'AGOTADO'
    WHEN (i.saldo_inicial + COALESCE(a.ingresos,0) - COALESCE(a.salidas,0)) <= i.stock_min_und THEN 'BAJO'
    ELSE 'OK'
  END AS estado
FROM public.insumos i LEFT JOIN agg a ON a.insumo_id = i.id;

CREATE VIEW public.vista_insumos_movimientos AS
SELECT m.id, m.fecha, m.insumo_id,
  i.categoria, i.grupo, i.subcategoria, i.codigo,
  m.tipo_mov, m.clase, m.cantidad, m.nro_guia, m.vale_num,
  m.proveedor, m.transportista, m.observacion, m.saldo_post,
  m.usuario_id, m.created_at
FROM public.insumos_movimientos m
JOIN public.insumos i ON i.id = m.insumo_id;

GRANT SELECT ON public.vista_insumos_stock TO authenticated;
GRANT SELECT ON public.vista_insumos_movimientos TO authenticated;

-- 4) Admin edit/delete functions for insumos_movimientos
CREATE OR REPLACE FUNCTION public.admin_eliminar_insumo_mov(p_mov uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'ADMIN') THEN RAISE EXCEPTION 'Solo ADMIN'; END IF;
  PERFORM set_config('app.bypass_movimientos_block','true', true);
  DELETE FROM public.insumos_movimientos WHERE id = p_mov;
END $$;

CREATE OR REPLACE FUNCTION public.admin_editar_insumo_mov(
  p_mov uuid, p_fecha date, p_insumo_id uuid, p_tipo tipo_mov_insumo_t,
  p_cantidad numeric, p_nro_guia text, p_vale_num text,
  p_proveedor text, p_transportista text, p_observacion text, p_saldo_post numeric
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_clase text;
BEGIN
  IF NOT public.has_role(auth.uid(),'ADMIN') THEN RAISE EXCEPTION 'Solo ADMIN'; END IF;
  IF p_cantidad IS NULL OR p_cantidad < 0 THEN RAISE EXCEPTION 'Cantidad inválida'; END IF;
  v_clase := CASE WHEN p_tipo IN ('INGRESO_GUIA','STOCK_INICIAL','DEVOLUCION','AJUSTE_POS') THEN 'INGRESO' ELSE 'SALIDA' END;
  PERFORM set_config('app.bypass_movimientos_block','true', true);
  UPDATE public.insumos_movimientos SET
    fecha = COALESCE(p_fecha, fecha),
    insumo_id = COALESCE(p_insumo_id, insumo_id),
    tipo_mov = COALESCE(p_tipo, tipo_mov),
    clase = v_clase,
    cantidad = p_cantidad,
    nro_guia = NULLIF(trim(COALESCE(p_nro_guia,'')),''),
    vale_num = NULLIF(trim(COALESCE(p_vale_num,'')),''),
    proveedor = NULLIF(trim(COALESCE(p_proveedor,'')),''),
    transportista = NULLIF(trim(COALESCE(p_transportista,'')),''),
    observacion = NULLIF(trim(COALESCE(p_observacion,'')),''),
    saldo_post = p_saldo_post
  WHERE id = p_mov;
END $$;
