
-- ============================================================
-- 1) Restrict clientes_proveedores reads to supervisor/admin
-- ============================================================
DROP POLICY IF EXISTS "rd cp" ON public.clientes_proveedores;
CREATE POLICY "rd cp" ON public.clientes_proveedores
  FOR SELECT TO authenticated
  USING (public.is_supervisor_or_admin(auth.uid()));

-- ============================================================
-- 2) insumos_movimientos: explicit deny for UPDATE/DELETE
--    (writes go through SECURITY DEFINER functions with bypass)
-- ============================================================
CREATE POLICY "insumos_mov_no_update" ON public.insumos_movimientos
  FOR UPDATE TO authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY "insumos_mov_no_delete" ON public.insumos_movimientos
  FOR DELETE TO authenticated
  USING (false);

-- ============================================================
-- 3) stock_lote_ubicacion: explicit deny for all writes
--    (stock changes only through registrar_movimiento SECURITY DEFINER)
-- ============================================================
CREATE POLICY "stock_no_insert" ON public.stock_lote_ubicacion
  FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY "stock_no_update" ON public.stock_lote_ubicacion
  FOR UPDATE TO authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY "stock_no_delete" ON public.stock_lote_ubicacion
  FOR DELETE TO authenticated
  USING (false);

-- ============================================================
-- 4) ventas_* : restrict reads and writes to supervisor/admin
-- ============================================================
-- Facturas
DROP POLICY IF EXISTS "fac_read"  ON public.ventas_facturas;
DROP POLICY IF EXISTS "fac_write" ON public.ventas_facturas;
CREATE POLICY "fac_read"  ON public.ventas_facturas FOR SELECT TO authenticated
  USING (public.is_supervisor_or_admin(auth.uid()));
CREATE POLICY "fac_write" ON public.ventas_facturas FOR ALL TO authenticated
  USING (public.is_supervisor_or_admin(auth.uid()))
  WITH CHECK (public.is_supervisor_or_admin(auth.uid()));

DROP POLICY IF EXISTS "fac_it_read"  ON public.ventas_factura_items;
DROP POLICY IF EXISTS "fac_it_write" ON public.ventas_factura_items;
CREATE POLICY "fac_it_read"  ON public.ventas_factura_items FOR SELECT TO authenticated
  USING (public.is_supervisor_or_admin(auth.uid()));
CREATE POLICY "fac_it_write" ON public.ventas_factura_items FOR ALL TO authenticated
  USING (public.is_supervisor_or_admin(auth.uid()))
  WITH CHECK (public.is_supervisor_or_admin(auth.uid()));

-- Cotizaciones
DROP POLICY IF EXISTS "cot_read"  ON public.ventas_cotizaciones;
DROP POLICY IF EXISTS "cot_write" ON public.ventas_cotizaciones;
CREATE POLICY "cot_read"  ON public.ventas_cotizaciones FOR SELECT TO authenticated
  USING (public.is_supervisor_or_admin(auth.uid()));
CREATE POLICY "cot_write" ON public.ventas_cotizaciones FOR ALL TO authenticated
  USING (public.is_supervisor_or_admin(auth.uid()))
  WITH CHECK (public.is_supervisor_or_admin(auth.uid()));

DROP POLICY IF EXISTS "cot_it_read"  ON public.ventas_cot_items;
DROP POLICY IF EXISTS "cot_it_write" ON public.ventas_cot_items;
CREATE POLICY "cot_it_read"  ON public.ventas_cot_items FOR SELECT TO authenticated
  USING (public.is_supervisor_or_admin(auth.uid()));
CREATE POLICY "cot_it_write" ON public.ventas_cot_items FOR ALL TO authenticated
  USING (public.is_supervisor_or_admin(auth.uid()))
  WITH CHECK (public.is_supervisor_or_admin(auth.uid()));

-- Órdenes de venta
DROP POLICY IF EXISTS "ov_read"  ON public.ventas_ordenes;
DROP POLICY IF EXISTS "ov_write" ON public.ventas_ordenes;
CREATE POLICY "ov_read"  ON public.ventas_ordenes FOR SELECT TO authenticated
  USING (public.is_supervisor_or_admin(auth.uid()));
CREATE POLICY "ov_write" ON public.ventas_ordenes FOR ALL TO authenticated
  USING (public.is_supervisor_or_admin(auth.uid()))
  WITH CHECK (public.is_supervisor_or_admin(auth.uid()));

DROP POLICY IF EXISTS "ov_it_read"  ON public.ventas_orden_items;
DROP POLICY IF EXISTS "ov_it_write" ON public.ventas_orden_items;
CREATE POLICY "ov_it_read"  ON public.ventas_orden_items FOR SELECT TO authenticated
  USING (public.is_supervisor_or_admin(auth.uid()));
CREATE POLICY "ov_it_write" ON public.ventas_orden_items FOR ALL TO authenticated
  USING (public.is_supervisor_or_admin(auth.uid()))
  WITH CHECK (public.is_supervisor_or_admin(auth.uid()));

-- Guías
DROP POLICY IF EXISTS "gr_read"  ON public.ventas_guias;
DROP POLICY IF EXISTS "gr_write" ON public.ventas_guias;
CREATE POLICY "gr_read"  ON public.ventas_guias FOR SELECT TO authenticated
  USING (public.is_supervisor_or_admin(auth.uid()));
CREATE POLICY "gr_write" ON public.ventas_guias FOR ALL TO authenticated
  USING (public.is_supervisor_or_admin(auth.uid()))
  WITH CHECK (public.is_supervisor_or_admin(auth.uid()));

DROP POLICY IF EXISTS "gr_it_read"  ON public.ventas_guia_items;
DROP POLICY IF EXISTS "gr_it_write" ON public.ventas_guia_items;
CREATE POLICY "gr_it_read"  ON public.ventas_guia_items FOR SELECT TO authenticated
  USING (public.is_supervisor_or_admin(auth.uid()));
CREATE POLICY "gr_it_write" ON public.ventas_guia_items FOR ALL TO authenticated
  USING (public.is_supervisor_or_admin(auth.uid()))
  WITH CHECK (public.is_supervisor_or_admin(auth.uid()));

-- ============================================================
-- 5) Revoke EXECUTE on SECURITY DEFINER functions from anon/PUBLIC
--    Revoke EXECUTE from authenticated on internal trigger-only fns
-- ============================================================
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;

-- Trigger-only functions: never called via RPC
REVOKE EXECUTE ON FUNCTION public.tg_recalc_ov()                    FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_recalc_cot()                   FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_recalc_fac()                   FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_ventas_fac_item_calc()         FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_ventas_guia_item_calc()        FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_ventas_item_calc()             FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_ventas_ov_item_calc()          FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_set_updated_at()               FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.block_mov_change()                FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.gen_codigo_lote()                 FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_role()            FROM authenticated;

-- Keep EXECUTE for authenticated on RPCs the app calls; each performs
-- its own role check via has_role() / is_supervisor_or_admin().
