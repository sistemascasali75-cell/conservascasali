
-- ENUMS
CREATE TYPE especie_t AS ENUM ('BONITO','ATUN','JUREL','CABALLA','ANCHOVETA');
CREATE TYPE presentacion_t AS ENUM ('FILETE','ENTERO','GRATED');
CREATE TYPE liquido_t AS ENUM ('ACEITE','AGUA Y SAL');
CREATE TYPE envase_t AS ENUM ('1/2 LB','1/2 LB-108','1 LB TALL','TINAPON');
CREATE TYPE estado_lote_t AS ENUM ('DISPONIBLE','INMOVILIZADO','POR_CERTIFICAR','EN_PROCESO','CUARENTENA');
CREATE TYPE mercado_t AS ENUM ('QW','M.LOCAL','MUNICIPIO','EXPORTACION');
CREATE TYPE tipo_mov_t AS ENUM ('ENTRADA','SALIDA','TRASLADO','AJUSTE_POSITIVO','AJUSTE_NEGATIVO','MERMA');
CREATE TYPE tipo_cp_t AS ENUM ('CLIENTE','PROVEEDOR','AMBOS');
CREATE TYPE estado_warrant_t AS ENUM ('ACTIVO','LIBERADO');

-- PRODUCTOS
CREATE TABLE public.productos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_base TEXT NOT NULL UNIQUE,
  descripcion TEXT NOT NULL,
  especie especie_t NOT NULL,
  presentacion presentacion_t NOT NULL,
  liquido_gobierno liquido_t NOT NULL,
  envase envase_t NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.productos TO authenticated;
GRANT ALL ON public.productos TO service_role;
ALTER TABLE public.productos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all productos" ON public.productos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ALMACENES
CREATE TABLE public.almacenes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL UNIQUE,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.almacenes TO authenticated;
GRANT ALL ON public.almacenes TO service_role;
ALTER TABLE public.almacenes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all almacenes" ON public.almacenes FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- UBICACIONES
CREATE TABLE public.ubicaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  almacen_id UUID NOT NULL REFERENCES public.almacenes(id) ON DELETE RESTRICT,
  codigo TEXT NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(almacen_id, codigo)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ubicaciones TO authenticated;
GRANT ALL ON public.ubicaciones TO service_role;
ALTER TABLE public.ubicaciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all ubicaciones" ON public.ubicaciones FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- CLIENTES / PROVEEDORES
CREATE TABLE public.clientes_proveedores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  tipo tipo_cp_t NOT NULL,
  documento TEXT,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clientes_proveedores TO authenticated;
GRANT ALL ON public.clientes_proveedores TO service_role;
ALTER TABLE public.clientes_proveedores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all cp" ON public.clientes_proveedores FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- LOTES
CREATE TABLE public.lotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id UUID NOT NULL REFERENCES public.productos(id) ON DELETE RESTRICT,
  fecha_produccion DATE NOT NULL,
  fecha_vencimiento DATE NOT NULL,
  codigo_lote TEXT NOT NULL,
  estado estado_lote_t NOT NULL DEFAULT 'DISPONIBLE',
  etiqueta TEXT,
  mercado mercado_t,
  usuario_marca TEXT,
  observacion TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(producto_id, fecha_produccion, fecha_vencimiento)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lotes TO authenticated;
GRANT ALL ON public.lotes TO service_role;
ALTER TABLE public.lotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all lotes" ON public.lotes FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Trigger para generar codigo_lote
CREATE OR REPLACE FUNCTION public.gen_codigo_lote()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE cb TEXT;
BEGIN
  SELECT codigo_base INTO cb FROM public.productos WHERE id = NEW.producto_id;
  NEW.codigo_lote := cb || ' FP:' || to_char(NEW.fecha_produccion,'DD-MM-YYYY') || ' FV:' || to_char(NEW.fecha_vencimiento,'DD-MM-YYYY');
  RETURN NEW;
END $$;
CREATE TRIGGER trg_gen_codigo_lote BEFORE INSERT OR UPDATE OF producto_id, fecha_produccion, fecha_vencimiento
  ON public.lotes FOR EACH ROW EXECUTE FUNCTION public.gen_codigo_lote();

-- STOCK
CREATE TABLE public.stock_lote_ubicacion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lote_id UUID NOT NULL REFERENCES public.lotes(id) ON DELETE RESTRICT,
  ubicacion_id UUID NOT NULL REFERENCES public.ubicaciones(id) ON DELETE RESTRICT,
  cantidad_cajas NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (cantidad_cajas >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(lote_id, ubicacion_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_lote_ubicacion TO authenticated;
GRANT ALL ON public.stock_lote_ubicacion TO service_role;
ALTER TABLE public.stock_lote_ubicacion ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all stock" ON public.stock_lote_ubicacion FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- WARRANTS
CREATE TABLE public.warrants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nro_warrant TEXT NOT NULL,
  lote_id UUID NOT NULL REFERENCES public.lotes(id) ON DELETE RESTRICT,
  cantidad_cajas_warrant NUMERIC(12,2) NOT NULL CHECK (cantidad_cajas_warrant > 0),
  financiera TEXT,
  fecha_inicio DATE NOT NULL,
  fecha_liberacion DATE,
  estado estado_warrant_t NOT NULL DEFAULT 'ACTIVO',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.warrants TO authenticated;
GRANT ALL ON public.warrants TO service_role;
ALTER TABLE public.warrants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all warrants" ON public.warrants FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- MOVIMIENTOS (kardex inmutable)
CREATE TABLE public.movimientos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo tipo_mov_t NOT NULL,
  fecha DATE NOT NULL DEFAULT current_date,
  lote_id UUID NOT NULL REFERENCES public.lotes(id) ON DELETE RESTRICT,
  ubicacion_origen_id UUID REFERENCES public.ubicaciones(id),
  ubicacion_destino_id UUID REFERENCES public.ubicaciones(id),
  cantidad_cajas NUMERIC(12,2) NOT NULL CHECK (cantidad_cajas > 0),
  nro_guia TEXT,
  nro_vale TEXT,
  cliente_proveedor_id UUID REFERENCES public.clientes_proveedores(id),
  motivo TEXT,
  usuario_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.movimientos TO authenticated;
GRANT ALL ON public.movimientos TO service_role;
ALTER TABLE public.movimientos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth select mov" ON public.movimientos FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert mov" ON public.movimientos FOR INSERT TO authenticated WITH CHECK (true);

-- Bloquear updates y deletes (kardex inmutable)
CREATE OR REPLACE FUNCTION public.block_mov_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Los movimientos son inmutables. Registre un contramovimiento.'; END $$;
CREATE TRIGGER trg_block_mov_update BEFORE UPDATE ON public.movimientos
  FOR EACH ROW EXECUTE FUNCTION public.block_mov_change();
CREATE TRIGGER trg_block_mov_delete BEFORE DELETE ON public.movimientos
  FOR EACH ROW EXECUTE FUNCTION public.block_mov_change();

-- Función central: registrar_movimiento
CREATE OR REPLACE FUNCTION public.registrar_movimiento(
  p_tipo tipo_mov_t,
  p_lote_id UUID,
  p_cantidad NUMERIC,
  p_ubic_origen UUID DEFAULT NULL,
  p_ubic_destino UUID DEFAULT NULL,
  p_cliente_proveedor UUID DEFAULT NULL,
  p_nro_guia TEXT DEFAULT NULL,
  p_nro_vale TEXT DEFAULT NULL,
  p_motivo TEXT DEFAULT NULL,
  p_fecha DATE DEFAULT current_date
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_stock NUMERIC;
  v_warrant NUMERIC;
  v_total_lote NUMERIC;
  v_mov_id UUID;
BEGIN
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN
    RAISE EXCEPTION 'La cantidad debe ser mayor a 0';
  END IF;

  -- Validaciones por tipo
  IF p_tipo IN ('SALIDA','MERMA','AJUSTE_NEGATIVO') THEN
    IF p_ubic_origen IS NULL THEN RAISE EXCEPTION 'Ubicación de origen requerida'; END IF;
    SELECT COALESCE(cantidad_cajas,0) INTO v_stock FROM stock_lote_ubicacion
      WHERE lote_id = p_lote_id AND ubicacion_id = p_ubic_origen;
    IF v_stock IS NULL THEN v_stock := 0; END IF;
    IF v_stock < p_cantidad THEN
      RAISE EXCEPTION 'Stock insuficiente. Disponible en ubicación: % cajas, solicitado: %', v_stock, p_cantidad;
    END IF;

    -- Validación warrant
    SELECT COALESCE(SUM(cantidad_cajas_warrant),0) INTO v_warrant FROM warrants
      WHERE lote_id = p_lote_id AND estado='ACTIVO';
    SELECT COALESCE(SUM(cantidad_cajas),0) INTO v_total_lote FROM stock_lote_ubicacion
      WHERE lote_id = p_lote_id;
    IF (v_total_lote - p_cantidad) < v_warrant THEN
      RAISE EXCEPTION 'Operación bloqueada por warrant. Total lote: %, comprometido en warrant: %, intentando dejar: %',
        v_total_lote, v_warrant, (v_total_lote - p_cantidad);
    END IF;

    UPDATE stock_lote_ubicacion SET cantidad_cajas = cantidad_cajas - p_cantidad, updated_at = now()
      WHERE lote_id = p_lote_id AND ubicacion_id = p_ubic_origen;

  ELSIF p_tipo IN ('ENTRADA','AJUSTE_POSITIVO') THEN
    IF p_ubic_destino IS NULL THEN RAISE EXCEPTION 'Ubicación de destino requerida'; END IF;
    INSERT INTO stock_lote_ubicacion(lote_id, ubicacion_id, cantidad_cajas)
      VALUES (p_lote_id, p_ubic_destino, p_cantidad)
      ON CONFLICT (lote_id, ubicacion_id)
      DO UPDATE SET cantidad_cajas = stock_lote_ubicacion.cantidad_cajas + p_cantidad, updated_at = now();

  ELSIF p_tipo = 'TRASLADO' THEN
    IF p_ubic_origen IS NULL OR p_ubic_destino IS NULL THEN
      RAISE EXCEPTION 'Traslado requiere ubicación origen y destino';
    END IF;
    SELECT COALESCE(cantidad_cajas,0) INTO v_stock FROM stock_lote_ubicacion
      WHERE lote_id = p_lote_id AND ubicacion_id = p_ubic_origen;
    IF v_stock IS NULL OR v_stock < p_cantidad THEN
      RAISE EXCEPTION 'Stock insuficiente en origen. Disponible: % cajas', COALESCE(v_stock,0);
    END IF;
    UPDATE stock_lote_ubicacion SET cantidad_cajas = cantidad_cajas - p_cantidad, updated_at = now()
      WHERE lote_id = p_lote_id AND ubicacion_id = p_ubic_origen;
    INSERT INTO stock_lote_ubicacion(lote_id, ubicacion_id, cantidad_cajas)
      VALUES (p_lote_id, p_ubic_destino, p_cantidad)
      ON CONFLICT (lote_id, ubicacion_id)
      DO UPDATE SET cantidad_cajas = stock_lote_ubicacion.cantidad_cajas + p_cantidad, updated_at = now();
  END IF;

  INSERT INTO movimientos(tipo, fecha, lote_id, ubicacion_origen_id, ubicacion_destino_id,
    cantidad_cajas, nro_guia, nro_vale, cliente_proveedor_id, motivo, usuario_id)
  VALUES (p_tipo, p_fecha, p_lote_id, p_ubic_origen, p_ubic_destino,
    p_cantidad, p_nro_guia, p_nro_vale, p_cliente_proveedor, p_motivo, auth.uid())
  RETURNING id INTO v_mov_id;

  RETURN v_mov_id;
END $$;

GRANT EXECUTE ON FUNCTION public.registrar_movimiento(tipo_mov_t,UUID,NUMERIC,UUID,UUID,UUID,TEXT,TEXT,TEXT,DATE) TO authenticated;

-- Vista de stock por lote con holgura warrant
CREATE OR REPLACE VIEW public.v_stock_lote AS
SELECT
  l.id AS lote_id,
  l.codigo_lote,
  l.producto_id,
  l.fecha_produccion,
  l.fecha_vencimiento,
  l.estado,
  l.etiqueta,
  l.mercado,
  COALESCE(s.total, 0) AS stock_total,
  COALESCE(w.total_warrant, 0) AS comprometido_warrant,
  COALESCE(s.total, 0) - COALESCE(w.total_warrant, 0) AS holgura
FROM lotes l
LEFT JOIN (SELECT lote_id, SUM(cantidad_cajas) AS total FROM stock_lote_ubicacion GROUP BY lote_id) s ON s.lote_id = l.id
LEFT JOIN (SELECT lote_id, SUM(cantidad_cajas_warrant) AS total_warrant FROM warrants WHERE estado='ACTIVO' GROUP BY lote_id) w ON w.lote_id = l.id;

GRANT SELECT ON public.v_stock_lote TO authenticated;
