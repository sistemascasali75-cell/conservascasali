
CREATE TABLE IF NOT EXISTS public.lances_produccion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero serial UNIQUE,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  usuario_cliente text NOT NULL DEFAULT '',
  producto text NOT NULL DEFAULT '',
  envase text NOT NULL DEFAULT '1/2 LB',
  latas_por_caja integer NOT NULL DEFAULT 48,
  envasado text,
  aceite text,
  agua text,
  parametros_extra jsonb NOT NULL DEFAULT '[]'::jsonb,
  carros numeric NOT NULL DEFAULT 0,
  lance_prod_cajas integer NOT NULL DEFAULT 0,
  lance_prod_latas integer NOT NULL DEFAULT 0,
  lance_real_cajas integer NOT NULL DEFAULT 0,
  lance_real_latas integer NOT NULL DEFAULT 0,
  merma_pruebas_cajas integer NOT NULL DEFAULT 0,
  merma_pruebas_latas integer NOT NULL DEFAULT 0,
  merma_malas_cajas integer NOT NULL DEFAULT 0,
  merma_malas_latas integer NOT NULL DEFAULT 0,
  merma_maquina_cajas integer NOT NULL DEFAULT 0,
  merma_maquina_latas integer NOT NULL DEFAULT 0,
  merma_muestras_cajas integer NOT NULL DEFAULT 0,
  merma_muestras_latas integer NOT NULL DEFAULT 0,
  observaciones text,
  registrado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lances_produccion TO authenticated;
GRANT ALL ON public.lances_produccion TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.lances_produccion_numero_seq TO authenticated;

ALTER TABLE public.lances_produccion ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lances_read_auth" ON public.lances_produccion
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "lances_insert_auth" ON public.lances_produccion
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "lances_update_auth" ON public.lances_produccion
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "lances_delete_admin" ON public.lances_produccion
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'ADMIN'::app_role));

CREATE TRIGGER trg_lances_produccion_updated
  BEFORE UPDATE ON public.lances_produccion
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_lances_fecha ON public.lances_produccion(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_lances_producto ON public.lances_produccion(producto);

CREATE TABLE IF NOT EXISTS public.lance_insumos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lance_id uuid NOT NULL REFERENCES public.lances_produccion(id) ON DELETE CASCADE,
  orden integer NOT NULL DEFAULT 0,
  insumo_id uuid REFERENCES public.insumos(id) ON DELETE SET NULL,
  nombre text NOT NULL,
  presentacion text,
  cantidad numeric NOT NULL DEFAULT 0,
  observacion text,
  movimiento_insumo_id uuid REFERENCES public.insumos_movimientos(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lance_insumos TO authenticated;
GRANT ALL ON public.lance_insumos TO service_role;

ALTER TABLE public.lance_insumos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lance_ins_read_auth" ON public.lance_insumos
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "lance_ins_insert_auth" ON public.lance_insumos
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "lance_ins_update_auth" ON public.lance_insumos
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "lance_ins_delete_auth" ON public.lance_insumos
  FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_lance_ins_lance ON public.lance_insumos(lance_id);
CREATE INDEX IF NOT EXISTS idx_lance_ins_insumo ON public.lance_insumos(insumo_id);
