CREATE TABLE public.codificado_tarifas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  maquina text NOT NULL,
  turno text NOT NULL DEFAULT 'DIA',
  tarifa numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (maquina, turno)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.codificado_tarifas TO authenticated;
GRANT ALL ON public.codificado_tarifas TO service_role;
ALTER TABLE public.codificado_tarifas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cod_tarifas_select" ON public.codificado_tarifas FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY "cod_tarifas_write" ON public.codificado_tarifas FOR ALL TO authenticated USING (public.is_operador_or_admin(auth.uid())) WITH CHECK (public.is_operador_or_admin(auth.uid()));

CREATE TABLE public.codificado_registros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha date NOT NULL DEFAULT current_date,
  lote_id uuid REFERENCES public.lotes(id) ON DELETE SET NULL,
  codigo_lote text NOT NULL,
  descripcion text,
  maquina text NOT NULL,
  turno text NOT NULL DEFAULT 'DIA',
  cajas numeric NOT NULL DEFAULT 0,
  tarifa numeric NOT NULL DEFAULT 0,
  importe numeric NOT NULL DEFAULT 0,
  observacion text,
  usuario_id uuid,
  usuario_nombre text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cod_reg_fecha ON public.codificado_registros (fecha);
CREATE INDEX idx_cod_reg_lote ON public.codificado_registros (lote_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.codificado_registros TO authenticated;
GRANT ALL ON public.codificado_registros TO service_role;
ALTER TABLE public.codificado_registros ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cod_reg_select" ON public.codificado_registros FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY "cod_reg_write" ON public.codificado_registros FOR ALL TO authenticated USING (public.is_operador_or_admin(auth.uid())) WITH CHECK (public.is_operador_or_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.tg_codificado_calc()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE v_tarifa numeric;
BEGIN
  IF NEW.maquina <> 'MAQ-1' THEN NEW.turno := 'DIA'; END IF;
  SELECT tarifa INTO v_tarifa FROM public.codificado_tarifas WHERE maquina = NEW.maquina AND turno = NEW.turno;
  IF v_tarifa IS NULL THEN v_tarifa := COALESCE(NEW.tarifa, 0); END IF;
  NEW.tarifa := v_tarifa;
  NEW.importe := ROUND(COALESCE(NEW.cajas,0) * v_tarifa, 2);
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_codificado_calc
BEFORE INSERT OR UPDATE ON public.codificado_registros
FOR EACH ROW EXECUTE FUNCTION public.tg_codificado_calc();

CREATE TRIGGER trg_cod_tarifas_updated
BEFORE UPDATE ON public.codificado_tarifas
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

INSERT INTO public.codificado_tarifas (maquina, turno, tarifa) VALUES
  ('MAQ-1','DIA',0.25),
  ('MAQ-1','NOCHE',0.30),
  ('MAQ-2','DIA',0.50),
  ('MAQ-3','DIA',0.50),
  ('MAQ-4','DIA',0.50);
