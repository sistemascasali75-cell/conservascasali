
-- 1) Limpiar datos existentes (solo 2 insumos y 4 movs)
DO $$ BEGIN PERFORM set_config('app.bypass_movimientos_block','true',true); END $$;
DELETE FROM public.insumos_movimientos;
DELETE FROM public.insumos;

-- 2) Extender tabla insumos
ALTER TABLE public.insumos
  ADD COLUMN IF NOT EXISTS categoria text,
  ADD COLUMN IF NOT EXISTS subcategoria text,
  ADD COLUMN IF NOT EXISTS descripcion text,
  ADD COLUMN IF NOT EXISTS unidad text NOT NULL DEFAULT 'UND';

ALTER TABLE public.insumos ALTER COLUMN proveedor DROP NOT NULL;

-- backfill por si quedaba algo
UPDATE public.insumos SET categoria=COALESCE(categoria,'GENERAL'), subcategoria=COALESCE(subcategoria, insumo);

ALTER TABLE public.insumos
  ALTER COLUMN categoria SET NOT NULL,
  ALTER COLUMN subcategoria SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_insumos_cat_sub ON public.insumos(categoria, subcategoria);

-- 3) Extender insumos_movimientos
ALTER TABLE public.insumos_movimientos
  ADD COLUMN IF NOT EXISTS vale_num text,
  ADD COLUMN IF NOT EXISTS transportista text,
  ADD COLUMN IF NOT EXISTS proveedor text,
  ADD COLUMN IF NOT EXISTS saldo_post numeric;

-- 4) Vista de stock recreada
DROP VIEW IF EXISTS public.vista_insumos_stock CASCADE;
CREATE VIEW public.vista_insumos_stock AS
WITH agg AS (
  SELECT insumo_id,
    COALESCE(SUM(CASE WHEN clase='INGRESO' THEN cantidad ELSE 0 END),0) AS ingresos,
    COALESCE(SUM(CASE WHEN clase='SALIDA'  THEN cantidad ELSE 0 END),0) AS salidas,
    MAX(fecha) AS ult_mov
  FROM public.insumos_movimientos GROUP BY insumo_id
)
SELECT i.id, i.codigo, i.categoria, i.subcategoria, i.proveedor, i.insumo, i.formato,
       i.empaque, i.und_x_empaque, i.unidad, i.stock_min_und, i.saldo_inicial, i.activo, i.descripcion,
       COALESCE(a.ingresos,0) AS ingresos,
       COALESCE(a.salidas,0)  AS salidas,
       (i.saldo_inicial + COALESCE(a.ingresos,0) - COALESCE(a.salidas,0)) AS saldo_und,
       ((i.saldo_inicial + COALESCE(a.ingresos,0) - COALESCE(a.salidas,0)) / NULLIF(i.und_x_empaque,0))::numeric AS saldo_emp,
       a.ult_mov,
       CASE
         WHEN (i.saldo_inicial + COALESCE(a.ingresos,0) - COALESCE(a.salidas,0)) <= 0 THEN 'AGOTADO'
         WHEN (i.saldo_inicial + COALESCE(a.ingresos,0) - COALESCE(a.salidas,0)) <= i.stock_min_und THEN 'BAJO'
         ELSE 'OK'
       END AS estado
FROM public.insumos i
LEFT JOIN agg a ON a.insumo_id = i.id;

GRANT SELECT ON public.vista_insumos_stock TO authenticated, anon;

-- 5) Vista de movimientos con info del insumo
DROP VIEW IF EXISTS public.vista_insumos_movimientos CASCADE;
CREATE VIEW public.vista_insumos_movimientos AS
SELECT m.id, m.fecha, m.insumo_id, i.categoria, i.subcategoria, i.codigo,
       m.tipo_mov, m.clase, m.cantidad, m.nro_guia, m.vale_num, m.proveedor, m.transportista,
       m.observacion, m.saldo_post, m.usuario_id, m.created_at
FROM public.insumos_movimientos m
JOIN public.insumos i ON i.id = m.insumo_id;

GRANT SELECT ON public.vista_insumos_movimientos TO authenticated, anon;

-- 6) Función registrar_movimiento_insumo ampliada (mantiene firma anterior + nuevos parametros opcionales)
DROP FUNCTION IF EXISTS public.registrar_movimiento_insumo(uuid, tipo_mov_insumo_t, numeric, text, text, date);
CREATE OR REPLACE FUNCTION public.registrar_movimiento_insumo(
  p_insumo_id uuid, p_tipo tipo_mov_insumo_t, p_cantidad numeric,
  p_nro_guia text DEFAULT NULL, p_observacion text DEFAULT NULL, p_fecha date DEFAULT CURRENT_DATE,
  p_vale_num text DEFAULT NULL, p_proveedor text DEFAULT NULL, p_transportista text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_clase TEXT; v_saldo NUMERIC; v_id UUID; v_post NUMERIC;
BEGIN
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN RAISE EXCEPTION 'Cantidad debe ser mayor a 0'; END IF;
  v_clase := CASE WHEN p_tipo IN ('INGRESO_GUIA','STOCK_INICIAL','DEVOLUCION','AJUSTE_POS') THEN 'INGRESO' ELSE 'SALIDA' END;
  SELECT saldo_inicial
    + COALESCE((SELECT SUM(cantidad) FROM insumos_movimientos WHERE insumo_id=p_insumo_id AND clase='INGRESO'),0)
    - COALESCE((SELECT SUM(cantidad) FROM insumos_movimientos WHERE insumo_id=p_insumo_id AND clase='SALIDA'),0)
  INTO v_saldo FROM insumos WHERE id = p_insumo_id;
  IF v_saldo IS NULL THEN RAISE EXCEPTION 'Insumo no existe'; END IF;
  IF v_clase = 'SALIDA' AND v_saldo < p_cantidad THEN
    RAISE EXCEPTION 'Stock insuficiente. Disponible: % und, solicitado: %', v_saldo, p_cantidad;
  END IF;
  v_post := CASE WHEN v_clase='INGRESO' THEN v_saldo + p_cantidad ELSE v_saldo - p_cantidad END;
  INSERT INTO insumos_movimientos(fecha, insumo_id, tipo_mov, clase, nro_guia, cantidad,
                                  observacion, usuario_id, vale_num, proveedor, transportista, saldo_post)
  VALUES (p_fecha, p_insumo_id, p_tipo, v_clase, p_nro_guia, p_cantidad,
          p_observacion, auth.uid(), p_vale_num, p_proveedor, p_transportista, v_post)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- 7) Política de escritura en movimientos (faltaba)
DROP POLICY IF EXISTS insumos_mov_write_auth ON public.insumos_movimientos;
CREATE POLICY insumos_mov_write_auth ON public.insumos_movimientos
  FOR INSERT TO authenticated WITH CHECK (true);
