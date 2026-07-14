
-- 1) Recreate view with security_invoker (fixes SECURITY DEFINER view)
DROP VIEW IF EXISTS public.vista_insumos_stock;
CREATE VIEW public.vista_insumos_stock
WITH (security_invoker = true) AS
SELECT i.id, i.codigo, i.proveedor, i.insumo, i.formato, i.empaque,
  i.und_x_empaque, i.stock_min_und, i.saldo_inicial, i.activo,
  COALESCE(ing.total,0) AS ingresos,
  COALESCE(sal.total,0) AS salidas,
  (i.saldo_inicial + COALESCE(ing.total,0) - COALESCE(sal.total,0)) AS saldo_und,
  ROUND((i.saldo_inicial + COALESCE(ing.total,0) - COALESCE(sal.total,0)) / NULLIF(i.und_x_empaque,0), 4) AS saldo_emp,
  CASE WHEN (i.saldo_inicial + COALESCE(ing.total,0) - COALESCE(sal.total,0)) <= 0 THEN 'AGOTADO'
       WHEN (i.saldo_inicial + COALESCE(ing.total,0) - COALESCE(sal.total,0)) < i.stock_min_und THEN 'BAJO'
       ELSE 'OK' END AS estado
FROM public.insumos i
LEFT JOIN (SELECT insumo_id, SUM(cantidad) total FROM public.insumos_movimientos WHERE clase='INGRESO' GROUP BY insumo_id) ing ON ing.insumo_id=i.id
LEFT JOIN (SELECT insumo_id, SUM(cantidad) total FROM public.insumos_movimientos WHERE clase='SALIDA' GROUP BY insumo_id) sal ON sal.insumo_id=i.id;
GRANT SELECT ON public.vista_insumos_stock TO authenticated;

-- 2) Lock down SECURITY DEFINER function execution to authenticated users only
REVOKE ALL ON FUNCTION public.registrar_movimiento_insumo(uuid, public.tipo_mov_insumo_t, numeric, text, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_movimiento_insumo(uuid, public.tipo_mov_insumo_t, numeric, text, text, date) TO authenticated;

-- 3) Remove permissive direct INSERT on insumos_movimientos — force through validated RPC
DROP POLICY IF EXISTS "insumos_mov_insert_auth" ON public.insumos_movimientos;

-- 4) Tighten inventario_conteo UPDATE to supervisors/admins
DROP POLICY IF EXISTS "ic update" ON public.inventario_conteo;
CREATE POLICY "ic update" ON public.inventario_conteo
  FOR UPDATE TO authenticated
  USING (public.is_supervisor_or_admin(auth.uid()) OR auth.uid() IS NOT NULL)
  WITH CHECK (public.is_supervisor_or_admin(auth.uid()) OR auth.uid() IS NOT NULL);

-- Actually: per finding, restrict to supervisors/admins OR the assigned almacenero.
DROP POLICY IF EXISTS "ic update" ON public.inventario_conteo;
CREATE POLICY "ic update" ON public.inventario_conteo
  FOR UPDATE TO authenticated
  USING (
    public.is_supervisor_or_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.inventarios_fisicos f
      WHERE f.id = inventario_conteo.inventario_id
        AND f.usuario_id = auth.uid()
        AND f.estado = 'EN_CONTEO'
    )
  )
  WITH CHECK (
    public.is_supervisor_or_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.inventarios_fisicos f
      WHERE f.id = inventario_conteo.inventario_id
        AND f.usuario_id = auth.uid()
        AND f.estado = 'EN_CONTEO'
    )
  );

-- 5) Tighten inventarios_fisicos UPDATE to supervisors/admins
DROP POLICY IF EXISTS "if update" ON public.inventarios_fisicos;
CREATE POLICY "if update" ON public.inventarios_fisicos
  FOR UPDATE TO authenticated
  USING (public.is_supervisor_or_admin(auth.uid()))
  WITH CHECK (public.is_supervisor_or_admin(auth.uid()));
