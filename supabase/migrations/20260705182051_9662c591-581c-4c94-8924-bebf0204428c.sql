
DROP POLICY "ic insert" ON public.inventario_conteo;
CREATE POLICY "ic insert" ON public.inventario_conteo FOR INSERT TO authenticated
WITH CHECK (
  public.is_supervisor_or_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.inventarios_fisicos f
    WHERE f.id = inventario_conteo.inventario_id
      AND f.usuario_id = auth.uid()
      AND f.estado IN ('BORRADOR'::estado_inv_fisico_t, 'EN_CONTEO'::estado_inv_fisico_t)
  )
);

DROP POLICY "ins lotes" ON public.lotes;
CREATE POLICY "ins lotes" ON public.lotes FOR INSERT TO authenticated
WITH CHECK (public.is_supervisor_or_admin(auth.uid()));

DROP POLICY "auth insert mov" ON public.movimientos;
CREATE POLICY "auth insert mov" ON public.movimientos FOR INSERT TO authenticated
WITH CHECK (public.is_supervisor_or_admin(auth.uid()));

DROP POLICY "ins oe" ON public.ordenes_etiquetado;
CREATE POLICY "ins oe" ON public.ordenes_etiquetado FOR INSERT TO authenticated
WITH CHECK (public.is_supervisor_or_admin(auth.uid()));
