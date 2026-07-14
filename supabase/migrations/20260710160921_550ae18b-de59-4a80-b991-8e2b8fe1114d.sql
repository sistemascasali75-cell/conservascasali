
DROP POLICY IF EXISTS insumos_mov_write_auth ON public.insumos_movimientos;
CREATE POLICY insumos_mov_write_auth ON public.insumos_movimientos
  FOR INSERT TO authenticated
  WITH CHECK (usuario_id = auth.uid() AND public.has_any_role(auth.uid()));
