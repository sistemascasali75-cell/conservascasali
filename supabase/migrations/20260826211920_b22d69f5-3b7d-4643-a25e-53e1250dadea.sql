CREATE TABLE public.muestreos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fecha date NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Lima')::date),
  lote_id uuid NOT NULL REFERENCES public.lotes(id) ON DELETE RESTRICT,
  ubicacion_id uuid REFERENCES public.ubicaciones(id) ON DELETE SET NULL,
  carril text,
  empaque integer NOT NULL DEFAULT 48,
  total_latas integer NOT NULL DEFAULT 0,
  actividad text NOT NULL DEFAULT 'MUESTREO',
  nuevo_lote_id uuid REFERENCES public.lotes(id) ON DELETE SET NULL,
  merma_cajas numeric NOT NULL DEFAULT 0,
  merma_latas integer NOT NULL DEFAULT 0,
  merma_total_latas integer NOT NULL DEFAULT 0,
  revisado boolean NOT NULL DEFAULT false,
  aplicado boolean NOT NULL DEFAULT false,
  observacion text,
  usuario_id uuid,
  usuario_nombre text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.muestreos TO authenticated;
GRANT ALL ON public.muestreos TO service_role;

ALTER TABLE public.muestreos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "muestreos_select_auth" ON public.muestreos
  FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));

CREATE POLICY "muestreos_write_op" ON public.muestreos
  FOR ALL TO authenticated
  USING (public.is_operador_or_admin(auth.uid()))
  WITH CHECK (public.is_operador_or_admin(auth.uid()));

CREATE TRIGGER muestreos_set_updated_at
  BEFORE UPDATE ON public.muestreos
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX idx_muestreos_fecha ON public.muestreos(fecha DESC);
CREATE INDEX idx_muestreos_lote ON public.muestreos(lote_id);