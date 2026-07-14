DROP POLICY IF EXISTS "if insert" ON public.inventarios_fisicos;
CREATE POLICY "if insert" ON public.inventarios_fisicos
FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND usuario_id = auth.uid()
  AND (supervisor_id IS NULL OR public.is_supervisor_or_admin(auth.uid()))
);