
DROP POLICY IF EXISTS "rd almacenes" ON public.almacenes;
CREATE POLICY "rd almacenes" ON public.almacenes FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));

DROP POLICY IF EXISTS "estados read" ON public.estados;
CREATE POLICY "estados read" ON public.estados FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));

DROP POLICY IF EXISTS "insumos_read_auth" ON public.insumos;
CREATE POLICY "insumos_read_auth" ON public.insumos FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));

DROP POLICY IF EXISTS "mercados_select_auth" ON public.mercados;
CREATE POLICY "mercados_select_auth" ON public.mercados FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));

DROP POLICY IF EXISTS "rd productos" ON public.productos;
CREATE POLICY "rd productos" ON public.productos FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));

DROP POLICY IF EXISTS "ventas_corr_read" ON public.ventas_correlativos;
CREATE POLICY "ventas_corr_read" ON public.ventas_correlativos FOR SELECT TO authenticated USING (public.is_supervisor_or_admin(auth.uid()));
