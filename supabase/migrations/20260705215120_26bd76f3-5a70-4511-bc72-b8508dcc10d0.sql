
-- Helper: user has any assigned role
CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id) $$;

-- calidad_codigos
DROP POLICY IF EXISTS "calidad_codigos_read_all" ON public.calidad_codigos;
CREATE POLICY "calidad_codigos_read_all" ON public.calidad_codigos
  FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));

-- insumos_movimientos
DROP POLICY IF EXISTS "im read" ON public.insumos_movimientos;
CREATE POLICY "im read" ON public.insumos_movimientos
  FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));

-- lotes
DROP POLICY IF EXISTS "rd lotes" ON public.lotes;
CREATE POLICY "rd lotes" ON public.lotes
  FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));

-- movimientos
DROP POLICY IF EXISTS "auth select mov" ON public.movimientos;
CREATE POLICY "auth select mov" ON public.movimientos
  FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));

-- stock_lote_ubicacion
DROP POLICY IF EXISTS "rd stock" ON public.stock_lote_ubicacion;
CREATE POLICY "rd stock" ON public.stock_lote_ubicacion
  FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));

-- ubicaciones
DROP POLICY IF EXISTS "rd ubicaciones" ON public.ubicaciones;
CREATE POLICY "rd ubicaciones" ON public.ubicaciones
  FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));

-- warrants
DROP POLICY IF EXISTS "warrants_read_all" ON public.warrants;
DROP POLICY IF EXISTS "wr read" ON public.warrants;
CREATE POLICY "warrants_read_all" ON public.warrants
  FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));

-- inventarios_fisicos INSERT: bind usuario_id to caller
DROP POLICY IF EXISTS "if insert" ON public.inventarios_fisicos;
CREATE POLICY "if insert" ON public.inventarios_fisicos
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND usuario_id = auth.uid()
    AND (supervisor_id IS NULL OR supervisor_id = auth.uid() OR public.is_supervisor_or_admin(auth.uid()))
  );
