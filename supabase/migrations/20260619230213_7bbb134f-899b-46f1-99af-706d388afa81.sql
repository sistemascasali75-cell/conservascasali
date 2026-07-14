
CREATE TYPE public.tipo_mov_insumo_t AS ENUM (
  'INGRESO_GUIA','STOCK_INICIAL','DEVOLUCION','AJUSTE_POS',
  'PRODUCCION','MUESTRAS','CALIBRACION','MERMA','PRESTAMO','AJUSTE_NEG'
);

CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TABLE public.insumos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo TEXT NOT NULL UNIQUE,
  proveedor TEXT NOT NULL,
  insumo TEXT NOT NULL,
  formato TEXT,
  empaque TEXT NOT NULL,
  und_x_empaque NUMERIC NOT NULL DEFAULT 1 CHECK (und_x_empaque > 0),
  stock_min_und NUMERIC NOT NULL DEFAULT 0,
  saldo_inicial NUMERIC NOT NULL DEFAULT 0,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.insumos TO authenticated;
GRANT ALL ON public.insumos TO service_role;
ALTER TABLE public.insumos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "insumos_read_auth" ON public.insumos FOR SELECT TO authenticated USING (true);
CREATE POLICY "insumos_write_super" ON public.insumos FOR ALL TO authenticated
  USING (public.is_supervisor_or_admin(auth.uid()))
  WITH CHECK (public.is_supervisor_or_admin(auth.uid()));
CREATE TRIGGER trg_insumos_updated_at BEFORE UPDATE ON public.insumos
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.insumos_movimientos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  insumo_id UUID NOT NULL REFERENCES public.insumos(id) ON DELETE RESTRICT,
  tipo_mov public.tipo_mov_insumo_t NOT NULL,
  clase TEXT NOT NULL CHECK (clase IN ('INGRESO','SALIDA')),
  nro_guia TEXT,
  cantidad NUMERIC NOT NULL CHECK (cantidad > 0),
  observacion TEXT,
  usuario_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_insumos_mov_insumo ON public.insumos_movimientos(insumo_id);
CREATE INDEX idx_insumos_mov_fecha ON public.insumos_movimientos(fecha DESC);
GRANT SELECT, INSERT ON public.insumos_movimientos TO authenticated;
GRANT ALL ON public.insumos_movimientos TO service_role;
ALTER TABLE public.insumos_movimientos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "insumos_mov_read_auth" ON public.insumos_movimientos FOR SELECT TO authenticated USING (true);
CREATE POLICY "insumos_mov_insert_auth" ON public.insumos_movimientos FOR INSERT TO authenticated WITH CHECK (true);
CREATE TRIGGER trg_block_insumos_mov_change BEFORE UPDATE OR DELETE ON public.insumos_movimientos
  FOR EACH ROW EXECUTE FUNCTION public.block_mov_change();

CREATE OR REPLACE FUNCTION public.registrar_movimiento_insumo(
  p_insumo_id UUID, p_tipo public.tipo_mov_insumo_t, p_cantidad NUMERIC,
  p_nro_guia TEXT DEFAULT NULL, p_observacion TEXT DEFAULT NULL, p_fecha DATE DEFAULT CURRENT_DATE
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_clase TEXT; v_saldo NUMERIC; v_id UUID;
BEGIN
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN RAISE EXCEPTION 'Cantidad debe ser mayor a 0'; END IF;
  v_clase := CASE WHEN p_tipo IN ('INGRESO_GUIA','STOCK_INICIAL','DEVOLUCION','AJUSTE_POS')
                  THEN 'INGRESO' ELSE 'SALIDA' END;
  IF v_clase = 'SALIDA' THEN
    SELECT saldo_inicial
      + COALESCE((SELECT SUM(cantidad) FROM insumos_movimientos WHERE insumo_id=p_insumo_id AND clase='INGRESO'),0)
      - COALESCE((SELECT SUM(cantidad) FROM insumos_movimientos WHERE insumo_id=p_insumo_id AND clase='SALIDA'),0)
    INTO v_saldo FROM insumos WHERE id = p_insumo_id;
    IF v_saldo IS NULL THEN RAISE EXCEPTION 'Insumo no existe'; END IF;
    IF v_saldo < p_cantidad THEN
      RAISE EXCEPTION 'Stock insuficiente. Disponible: % und, solicitado: %', v_saldo, p_cantidad;
    END IF;
  END IF;
  INSERT INTO insumos_movimientos(fecha, insumo_id, tipo_mov, clase, nro_guia, cantidad, observacion, usuario_id)
  VALUES (p_fecha, p_insumo_id, p_tipo, v_clase, p_nro_guia, p_cantidad, p_observacion, auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE VIEW public.vista_insumos_stock AS
SELECT i.id, i.codigo, i.proveedor, i.insumo, i.formato, i.empaque,
  i.und_x_empaque, i.stock_min_und, i.saldo_inicial, i.activo,
  COALESCE(ing.total,0) AS ingresos,
  COALESCE(sal.total,0) AS salidas,
  (i.saldo_inicial + COALESCE(ing.total,0) - COALESCE(sal.total,0)) AS saldo_und,
  ROUND((i.saldo_inicial + COALESCE(ing.total,0) - COALESCE(sal.total,0)) / NULLIF(i.und_x_empaque,0), 4) AS saldo_emp,
  CASE WHEN (i.saldo_inicial + COALESCE(ing.total,0) - COALESCE(sal.total,0)) <= 0 THEN 'AGOTADO'
       WHEN (i.saldo_inicial + COALESCE(ing.total,0) - COALESCE(sal.total,0)) < i.stock_min_und THEN 'BAJO'
       ELSE 'OK' END AS estado
FROM insumos i
LEFT JOIN (SELECT insumo_id, SUM(cantidad) total FROM insumos_movimientos WHERE clase='INGRESO' GROUP BY insumo_id) ing ON ing.insumo_id=i.id
LEFT JOIN (SELECT insumo_id, SUM(cantidad) total FROM insumos_movimientos WHERE clase='SALIDA' GROUP BY insumo_id) sal ON sal.insumo_id=i.id;
GRANT SELECT ON public.vista_insumos_stock TO authenticated;
