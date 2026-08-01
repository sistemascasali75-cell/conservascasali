CREATE POLICY "insumos_write_rol_insumos" ON public.insumos FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'INSUMOS'))
WITH CHECK (public.has_role(auth.uid(),'INSUMOS'));

DROP POLICY IF EXISTS "lances_delete_admin" ON public.lances_produccion;
CREATE POLICY "lances_delete_roles" ON public.lances_produccion FOR DELETE TO authenticated
USING (public.has_role(auth.uid(),'ADMIN') OR public.has_role(auth.uid(),'INSUMOS'));