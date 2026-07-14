
-- Drop overly permissive duplicate policies
DROP POLICY IF EXISTS "insumos_mov_read_auth" ON public.insumos_movimientos;
DROP POLICY IF EXISTS "rd warrants" ON public.warrants;
DROP POLICY IF EXISTS "rd oe" ON public.ordenes_etiquetado;

-- ordenes_etiquetado: role-scoped SELECT
CREATE POLICY "oe_read_role" ON public.ordenes_etiquetado
  FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));

-- inventario_conteo: restrict to supervisor/admin or the responsible counter
DROP POLICY IF EXISTS "ic select" ON public.inventario_conteo;
CREATE POLICY "ic select" ON public.inventario_conteo
  FOR SELECT TO authenticated USING (
    public.is_supervisor_or_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.inventarios_fisicos i
      WHERE i.id = inventario_conteo.inventario_id
        AND (i.usuario_id = auth.uid() OR i.supervisor_id = auth.uid())
    )
  );

-- inventarios_fisicos: restrict to supervisor/admin or involved staff
DROP POLICY IF EXISTS "rd if" ON public.inventarios_fisicos;
CREATE POLICY "rd if" ON public.inventarios_fisicos
  FOR SELECT TO authenticated USING (
    public.is_supervisor_or_admin(auth.uid())
    OR usuario_id = auth.uid()
    OR supervisor_id = auth.uid()
  );

-- Revoke anon EXECUTE on has_any_role helper
REVOKE EXECUTE ON FUNCTION public.has_any_role(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_any_role(uuid) TO authenticated, service_role;
