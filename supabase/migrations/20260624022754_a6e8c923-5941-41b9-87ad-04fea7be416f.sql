
CREATE TABLE public.mercados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mercado text NOT NULL UNIQUE,
  nivel text,
  datos text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mercados TO authenticated;
GRANT ALL ON public.mercados TO service_role;

ALTER TABLE public.mercados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mercados_select_auth" ON public.mercados FOR SELECT TO authenticated USING (true);
CREATE POLICY "mercados_admin_all" ON public.mercados FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'ADMIN'))
  WITH CHECK (public.has_role(auth.uid(),'ADMIN'));

CREATE TRIGGER trg_mercados_updated_at BEFORE UPDATE ON public.mercados
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.movimientos
  ADD COLUMN mercado_id uuid REFERENCES public.mercados(id);

-- Seed common markets
INSERT INTO public.mercados(mercado, nivel) VALUES
  ('NACIONAL','Local'),
  ('EXPORTACION','Internacional')
ON CONFLICT (mercado) DO NOTHING;
