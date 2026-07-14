
-- ============ Correlativos ============
CREATE TABLE public.ventas_correlativos (
  serie text PRIMARY KEY,
  siguiente_numero integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ventas_correlativos TO authenticated;
GRANT ALL ON public.ventas_correlativos TO service_role;
ALTER TABLE public.ventas_correlativos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ventas_corr_read" ON public.ventas_correlativos FOR SELECT TO authenticated USING (true);

INSERT INTO public.ventas_correlativos(serie, siguiente_numero) VALUES
  ('COT', 1), ('OV', 1), ('F001', 1), ('B001', 1), ('T001', 1);

CREATE OR REPLACE FUNCTION public.ventas_next_codigo(p_serie text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_num integer;
BEGIN
  INSERT INTO public.ventas_correlativos(serie, siguiente_numero) VALUES (p_serie, 1)
    ON CONFLICT (serie) DO NOTHING;
  UPDATE public.ventas_correlativos SET siguiente_numero = siguiente_numero + 1, updated_at = now()
    WHERE serie = p_serie RETURNING siguiente_numero - 1 INTO v_num;
  RETURN p_serie || '-' || lpad(v_num::text, 6, '0');
END $$;
REVOKE EXECUTE ON FUNCTION public.ventas_next_codigo(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ventas_next_codigo(text) TO authenticated;

-- ============ Enums ============
DO $$ BEGIN
  CREATE TYPE public.ventas_estado_cot_t AS ENUM ('BORRADOR','ENVIADA','ACEPTADA','RECHAZADA','VENCIDA','CONVERTIDA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.ventas_estado_ov_t AS ENUM ('PENDIENTE','RESERVADA','PARCIAL','FACTURADA','DESPACHADA','ANULADA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.ventas_estado_fac_t AS ENUM ('EMITIDA','PAGADA','ANULADA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.ventas_estado_guia_t AS ENUM ('BORRADOR','EMITIDA','ANULADA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ COTIZACIONES ============
CREATE TABLE public.ventas_cotizaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  serie text NOT NULL DEFAULT 'COT',
  numero integer NOT NULL,
  codigo text NOT NULL UNIQUE,
  cliente_id uuid NOT NULL REFERENCES public.clientes_proveedores(id),
  fecha_emision date NOT NULL DEFAULT CURRENT_DATE,
  fecha_validez date,
  moneda text NOT NULL DEFAULT 'PEN',
  tipo_cambio numeric(10,4),
  condicion_pago text,
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  descuento_global numeric(14,2) NOT NULL DEFAULT 0,
  igv numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  estado public.ventas_estado_cot_t NOT NULL DEFAULT 'BORRADOR',
  observaciones text,
  usuario_id uuid,
  usuario_nombre text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ventas_cotizaciones TO authenticated;
GRANT ALL ON public.ventas_cotizaciones TO service_role;
ALTER TABLE public.ventas_cotizaciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cot_read" ON public.ventas_cotizaciones FOR SELECT TO authenticated USING (true);
CREATE POLICY "cot_write" ON public.ventas_cotizaciones FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE TRIGGER trg_cot_upd BEFORE UPDATE ON public.ventas_cotizaciones FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.ventas_cot_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cotizacion_id uuid NOT NULL REFERENCES public.ventas_cotizaciones(id) ON DELETE CASCADE,
  producto_id uuid NOT NULL REFERENCES public.productos(id),
  descripcion text NOT NULL,
  cantidad_cajas numeric(14,3) NOT NULL DEFAULT 0,
  empaque integer NOT NULL DEFAULT 48,
  cantidad_latas numeric(14,2) NOT NULL DEFAULT 0,
  unidad_precio text NOT NULL DEFAULT 'CAJA',
  precio_unitario numeric(14,4) NOT NULL DEFAULT 0,
  descuento_pct numeric(5,2) NOT NULL DEFAULT 0,
  importe numeric(14,2) NOT NULL DEFAULT 0,
  orden integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ventas_cot_items TO authenticated;
GRANT ALL ON public.ventas_cot_items TO service_role;
ALTER TABLE public.ventas_cot_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cot_it_read" ON public.ventas_cot_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "cot_it_write" ON public.ventas_cot_items FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- ============ ORDENES ============
CREATE TABLE public.ventas_ordenes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  serie text NOT NULL DEFAULT 'OV',
  numero integer NOT NULL,
  codigo text NOT NULL UNIQUE,
  cotizacion_id uuid REFERENCES public.ventas_cotizaciones(id),
  cliente_id uuid NOT NULL REFERENCES public.clientes_proveedores(id),
  oc_cliente_ref text,
  fecha_emision date NOT NULL DEFAULT CURRENT_DATE,
  fecha_entrega date,
  moneda text NOT NULL DEFAULT 'PEN',
  tipo_cambio numeric(10,4),
  condicion_pago text,
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  igv numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  estado public.ventas_estado_ov_t NOT NULL DEFAULT 'PENDIENTE',
  observaciones text,
  usuario_id uuid,
  usuario_nombre text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ventas_ordenes TO authenticated;
GRANT ALL ON public.ventas_ordenes TO service_role;
ALTER TABLE public.ventas_ordenes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ov_read" ON public.ventas_ordenes FOR SELECT TO authenticated USING (true);
CREATE POLICY "ov_write" ON public.ventas_ordenes FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE TRIGGER trg_ov_upd BEFORE UPDATE ON public.ventas_ordenes FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.ventas_orden_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id uuid NOT NULL REFERENCES public.ventas_ordenes(id) ON DELETE CASCADE,
  producto_id uuid NOT NULL REFERENCES public.productos(id),
  descripcion text NOT NULL,
  cantidad_cajas numeric(14,3) NOT NULL DEFAULT 0,
  empaque integer NOT NULL DEFAULT 48,
  cantidad_latas numeric(14,2) NOT NULL DEFAULT 0,
  precio_unitario numeric(14,4) NOT NULL DEFAULT 0,
  descuento_pct numeric(5,2) NOT NULL DEFAULT 0,
  importe numeric(14,2) NOT NULL DEFAULT 0,
  lote_id uuid REFERENCES public.lotes(id),
  ubicacion_id uuid REFERENCES public.ubicaciones(id),
  cantidad_reservada_cajas numeric(14,3) DEFAULT 0,
  cantidad_despachada_cajas numeric(14,3) DEFAULT 0,
  orden integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ventas_orden_items TO authenticated;
GRANT ALL ON public.ventas_orden_items TO service_role;
ALTER TABLE public.ventas_orden_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ov_it_read" ON public.ventas_orden_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "ov_it_write" ON public.ventas_orden_items FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- ============ FACTURAS ============
CREATE TABLE public.ventas_facturas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  serie text NOT NULL DEFAULT 'F001',
  numero integer NOT NULL,
  codigo text NOT NULL UNIQUE,
  tipo_comprobante text NOT NULL DEFAULT 'FACTURA',
  orden_id uuid REFERENCES public.ventas_ordenes(id),
  cliente_id uuid NOT NULL REFERENCES public.clientes_proveedores(id),
  cliente_ruc text,
  cliente_razon_social text,
  fecha_emision date NOT NULL DEFAULT CURRENT_DATE,
  fecha_vencimiento date,
  moneda text NOT NULL DEFAULT 'PEN',
  tipo_cambio numeric(10,4),
  op_gravada numeric(14,2) NOT NULL DEFAULT 0,
  op_exonerada numeric(14,2) NOT NULL DEFAULT 0,
  op_inafecta numeric(14,2) NOT NULL DEFAULT 0,
  descuento numeric(14,2) NOT NULL DEFAULT 0,
  igv numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  condicion_pago text,
  estado public.ventas_estado_fac_t NOT NULL DEFAULT 'EMITIDA',
  hash_cpe text,
  observaciones text,
  usuario_id uuid,
  usuario_nombre text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ventas_facturas TO authenticated;
GRANT ALL ON public.ventas_facturas TO service_role;
ALTER TABLE public.ventas_facturas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fac_read" ON public.ventas_facturas FOR SELECT TO authenticated USING (true);
CREATE POLICY "fac_write" ON public.ventas_facturas FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE TRIGGER trg_fac_upd BEFORE UPDATE ON public.ventas_facturas FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.ventas_factura_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factura_id uuid NOT NULL REFERENCES public.ventas_facturas(id) ON DELETE CASCADE,
  producto_id uuid NOT NULL REFERENCES public.productos(id),
  descripcion text NOT NULL,
  cantidad_cajas numeric(14,3) NOT NULL DEFAULT 0,
  empaque integer NOT NULL DEFAULT 48,
  cantidad_latas numeric(14,2) NOT NULL DEFAULT 0,
  unidad_precio text NOT NULL DEFAULT 'CAJA',
  precio_unitario numeric(14,4) NOT NULL DEFAULT 0,
  descuento_pct numeric(5,2) NOT NULL DEFAULT 0,
  tipo_afectacion_igv text NOT NULL DEFAULT 'GRAVADO',
  valor_venta numeric(14,2) NOT NULL DEFAULT 0,
  igv_linea numeric(14,2) NOT NULL DEFAULT 0,
  importe numeric(14,2) NOT NULL DEFAULT 0,
  orden integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ventas_factura_items TO authenticated;
GRANT ALL ON public.ventas_factura_items TO service_role;
ALTER TABLE public.ventas_factura_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fac_it_read" ON public.ventas_factura_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "fac_it_write" ON public.ventas_factura_items FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- ============ GUIAS ============
CREATE TABLE public.ventas_guias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  serie text NOT NULL DEFAULT 'T001',
  numero integer NOT NULL,
  codigo text NOT NULL UNIQUE,
  orden_id uuid REFERENCES public.ventas_ordenes(id),
  factura_id uuid REFERENCES public.ventas_facturas(id),
  cliente_id uuid NOT NULL REFERENCES public.clientes_proveedores(id),
  fecha_emision date NOT NULL DEFAULT CURRENT_DATE,
  fecha_traslado date,
  motivo_traslado text DEFAULT 'VENTA',
  transportista text,
  transportista_ruc text,
  placa text,
  conductor text,
  punto_partida text,
  punto_llegada text,
  peso_total_kg numeric(14,2),
  bultos integer,
  estado public.ventas_estado_guia_t NOT NULL DEFAULT 'BORRADOR',
  observaciones text,
  usuario_id uuid,
  usuario_nombre text,
  emitida_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ventas_guias TO authenticated;
GRANT ALL ON public.ventas_guias TO service_role;
ALTER TABLE public.ventas_guias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gr_read" ON public.ventas_guias FOR SELECT TO authenticated USING (true);
CREATE POLICY "gr_write" ON public.ventas_guias FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE TRIGGER trg_gr_upd BEFORE UPDATE ON public.ventas_guias FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.ventas_guia_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guia_id uuid NOT NULL REFERENCES public.ventas_guias(id) ON DELETE CASCADE,
  orden_item_id uuid REFERENCES public.ventas_orden_items(id),
  producto_id uuid NOT NULL REFERENCES public.productos(id),
  descripcion text NOT NULL,
  cantidad_cajas numeric(14,3) NOT NULL DEFAULT 0,
  latas integer DEFAULT 0,
  empaque integer NOT NULL DEFAULT 48,
  cantidad_latas numeric(14,2) NOT NULL DEFAULT 0,
  lote_id uuid NOT NULL REFERENCES public.lotes(id),
  ubicacion_id uuid NOT NULL REFERENCES public.ubicaciones(id),
  movimiento_id uuid,
  orden integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ventas_guia_items TO authenticated;
GRANT ALL ON public.ventas_guia_items TO service_role;
ALTER TABLE public.ventas_guia_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gr_it_read" ON public.ventas_guia_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "gr_it_write" ON public.ventas_guia_items FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- ============ Vinculación con movimientos ============
ALTER TABLE public.movimientos ADD COLUMN IF NOT EXISTS guia_id uuid REFERENCES public.ventas_guias(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_mov_guia ON public.movimientos(guia_id) WHERE guia_id IS NOT NULL;

-- ============ Triggers de cálculo ============
CREATE OR REPLACE FUNCTION public.tg_ventas_item_calc()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v_emp integer; v_cant numeric; v_prec numeric; v_desc numeric; v_imp numeric;
BEGIN
  v_emp := COALESCE(NEW.empaque, 48);
  NEW.cantidad_latas := COALESCE(NEW.cantidad_cajas,0) * v_emp;
  v_cant := CASE WHEN COALESCE(NEW.unidad_precio,'CAJA') = 'LATA' THEN NEW.cantidad_latas ELSE COALESCE(NEW.cantidad_cajas,0) END;
  v_prec := COALESCE(NEW.precio_unitario, 0);
  v_desc := COALESCE(NEW.descuento_pct, 0) / 100.0;
  v_imp := round(v_cant * v_prec * (1 - v_desc), 2);
  NEW.importe := v_imp;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_cot_it_calc BEFORE INSERT OR UPDATE ON public.ventas_cot_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_ventas_item_calc();

CREATE OR REPLACE FUNCTION public.tg_ventas_ov_item_calc()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  NEW.empaque := COALESCE(NEW.empaque, 48);
  NEW.cantidad_latas := COALESCE(NEW.cantidad_cajas,0) * NEW.empaque;
  NEW.importe := round(COALESCE(NEW.cantidad_cajas,0) * COALESCE(NEW.precio_unitario,0) * (1 - COALESCE(NEW.descuento_pct,0)/100.0), 2);
  RETURN NEW;
END $$;
CREATE TRIGGER trg_ov_it_calc BEFORE INSERT OR UPDATE ON public.ventas_orden_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_ventas_ov_item_calc();

CREATE OR REPLACE FUNCTION public.tg_ventas_fac_item_calc()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v_cant numeric; v_base numeric;
BEGIN
  NEW.empaque := COALESCE(NEW.empaque, 48);
  NEW.cantidad_latas := COALESCE(NEW.cantidad_cajas,0) * NEW.empaque;
  v_cant := CASE WHEN COALESCE(NEW.unidad_precio,'CAJA')='LATA' THEN NEW.cantidad_latas ELSE COALESCE(NEW.cantidad_cajas,0) END;
  v_base := round(v_cant * COALESCE(NEW.precio_unitario,0) * (1 - COALESCE(NEW.descuento_pct,0)/100.0), 2);
  NEW.valor_venta := v_base;
  IF COALESCE(NEW.tipo_afectacion_igv,'GRAVADO')='GRAVADO' THEN
    NEW.igv_linea := round(v_base * 0.18, 2);
  ELSE
    NEW.igv_linea := 0;
  END IF;
  NEW.importe := v_base + NEW.igv_linea;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_fac_it_calc BEFORE INSERT OR UPDATE ON public.ventas_factura_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_ventas_fac_item_calc();

CREATE OR REPLACE FUNCTION public.tg_ventas_guia_item_calc()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  NEW.empaque := COALESCE(NEW.empaque, 48);
  NEW.cantidad_latas := COALESCE(NEW.cantidad_cajas,0) * NEW.empaque + COALESCE(NEW.latas,0);
  RETURN NEW;
END $$;
CREATE TRIGGER trg_gr_it_calc BEFORE INSERT OR UPDATE ON public.ventas_guia_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_ventas_guia_item_calc();

-- Recálculo de cabeceras
CREATE OR REPLACE FUNCTION public.tg_recalc_cot()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v_id uuid; v_sub numeric; v_desc numeric; v_igv numeric;
BEGIN
  v_id := COALESCE(NEW.cotizacion_id, OLD.cotizacion_id);
  SELECT COALESCE(SUM(importe),0) INTO v_sub FROM public.ventas_cot_items WHERE cotizacion_id = v_id;
  SELECT COALESCE(descuento_global,0) INTO v_desc FROM public.ventas_cotizaciones WHERE id = v_id;
  v_igv := round(GREATEST(v_sub - v_desc,0) * 0.18, 2);
  UPDATE public.ventas_cotizaciones
    SET subtotal = v_sub, igv = v_igv, total = round(GREATEST(v_sub - v_desc,0) + v_igv, 2), updated_at = now()
    WHERE id = v_id;
  RETURN NULL;
END $$;
CREATE TRIGGER trg_cot_recalc AFTER INSERT OR UPDATE OR DELETE ON public.ventas_cot_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_recalc_cot();

CREATE OR REPLACE FUNCTION public.tg_recalc_ov()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v_id uuid; v_sub numeric; v_igv numeric;
BEGIN
  v_id := COALESCE(NEW.orden_id, OLD.orden_id);
  SELECT COALESCE(SUM(importe),0) INTO v_sub FROM public.ventas_orden_items WHERE orden_id = v_id;
  v_igv := round(v_sub * 0.18, 2);
  UPDATE public.ventas_ordenes SET subtotal = v_sub, igv = v_igv, total = round(v_sub + v_igv, 2), updated_at = now() WHERE id = v_id;
  RETURN NULL;
END $$;
CREATE TRIGGER trg_ov_recalc AFTER INSERT OR UPDATE OR DELETE ON public.ventas_orden_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_recalc_ov();

CREATE OR REPLACE FUNCTION public.tg_recalc_fac()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v_id uuid; v_grav numeric; v_exo numeric; v_ina numeric; v_igv numeric; v_tot numeric;
BEGIN
  v_id := COALESCE(NEW.factura_id, OLD.factura_id);
  SELECT COALESCE(SUM(CASE WHEN tipo_afectacion_igv='GRAVADO' THEN valor_venta ELSE 0 END),0),
         COALESCE(SUM(CASE WHEN tipo_afectacion_igv='EXONERADO' THEN valor_venta ELSE 0 END),0),
         COALESCE(SUM(CASE WHEN tipo_afectacion_igv='INAFECTO' THEN valor_venta ELSE 0 END),0),
         COALESCE(SUM(igv_linea),0),
         COALESCE(SUM(importe),0)
    INTO v_grav, v_exo, v_ina, v_igv, v_tot
    FROM public.ventas_factura_items WHERE factura_id = v_id;
  UPDATE public.ventas_facturas
    SET op_gravada = v_grav, op_exonerada = v_exo, op_inafecta = v_ina, igv = v_igv, total = round(v_tot,2), updated_at = now()
    WHERE id = v_id;
  RETURN NULL;
END $$;
CREATE TRIGGER trg_fac_recalc AFTER INSERT OR UPDATE OR DELETE ON public.ventas_factura_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_recalc_fac();

-- ============ Convertir COT → OV ============
CREATE OR REPLACE FUNCTION public.ventas_convertir_cot_a_orden(p_cot uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_cot record; v_ov uuid; v_cod text; v_num integer; v_email text; v_lote uuid;
BEGIN
  SELECT * INTO v_cot FROM public.ventas_cotizaciones WHERE id = p_cot;
  IF v_cot IS NULL THEN RAISE EXCEPTION 'Cotización no existe'; END IF;
  v_cod := public.ventas_next_codigo('OV');
  v_num := (regexp_replace(v_cod, '^OV-', ''))::integer;
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  INSERT INTO public.ventas_ordenes(serie, numero, codigo, cotizacion_id, cliente_id, moneda, tipo_cambio, condicion_pago, observaciones, usuario_id, usuario_nombre)
    VALUES ('OV', v_num, v_cod, p_cot, v_cot.cliente_id, v_cot.moneda, v_cot.tipo_cambio, v_cot.condicion_pago, v_cot.observaciones, auth.uid(), v_email)
    RETURNING id INTO v_ov;
  -- Copiar líneas con sugerencia FEFO
  INSERT INTO public.ventas_orden_items(orden_id, producto_id, descripcion, cantidad_cajas, empaque, precio_unitario, descuento_pct, orden, lote_id)
    SELECT v_ov, i.producto_id, i.descripcion, i.cantidad_cajas, i.empaque, i.precio_unitario, i.descuento_pct, i.orden,
      (SELECT l.id FROM public.lotes l
        JOIN public.stock_lote_ubicacion s ON s.lote_id = l.id
        WHERE l.producto_id = i.producto_id AND s.cantidad_cajas > 0
        ORDER BY l.fecha_vencimiento ASC LIMIT 1)
    FROM public.ventas_cot_items i WHERE i.cotizacion_id = p_cot ORDER BY i.orden NULLS LAST;
  UPDATE public.ventas_cotizaciones SET estado = 'CONVERTIDA' WHERE id = p_cot;
  RETURN v_ov;
END $$;
REVOKE EXECUTE ON FUNCTION public.ventas_convertir_cot_a_orden(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ventas_convertir_cot_a_orden(uuid) TO authenticated;

-- ============ Convertir OV → Factura ============
CREATE OR REPLACE FUNCTION public.ventas_convertir_orden_a_factura(p_ov uuid, p_tipo text DEFAULT 'FACTURA', p_serie text DEFAULT 'F001')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_ov record; v_cli record; v_fac uuid; v_cod text; v_num integer; v_email text;
BEGIN
  SELECT * INTO v_ov FROM public.ventas_ordenes WHERE id = p_ov;
  IF v_ov IS NULL THEN RAISE EXCEPTION 'Orden no existe'; END IF;
  SELECT * INTO v_cli FROM public.clientes_proveedores WHERE id = v_ov.cliente_id;
  v_cod := public.ventas_next_codigo(p_serie);
  v_num := (regexp_replace(v_cod, '^' || p_serie || '-', ''))::integer;
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  INSERT INTO public.ventas_facturas(serie, numero, codigo, tipo_comprobante, orden_id, cliente_id, cliente_ruc, cliente_razon_social,
    moneda, tipo_cambio, condicion_pago, observaciones, usuario_id, usuario_nombre)
    VALUES (p_serie, v_num, v_cod, p_tipo, p_ov, v_ov.cliente_id, v_cli.ruc, COALESCE(v_cli.razon_social, v_cli.nombre),
      v_ov.moneda, v_ov.tipo_cambio, v_ov.condicion_pago, v_ov.observaciones, auth.uid(), v_email)
    RETURNING id INTO v_fac;
  INSERT INTO public.ventas_factura_items(factura_id, producto_id, descripcion, cantidad_cajas, empaque, unidad_precio, precio_unitario, descuento_pct, tipo_afectacion_igv, orden)
    SELECT v_fac, i.producto_id, i.descripcion, i.cantidad_cajas, i.empaque, 'CAJA', i.precio_unitario, i.descuento_pct, 'GRAVADO', i.orden
    FROM public.ventas_orden_items i WHERE i.orden_id = p_ov ORDER BY i.orden NULLS LAST;
  UPDATE public.ventas_ordenes SET estado = 'FACTURADA' WHERE id = p_ov;
  RETURN v_fac;
END $$;
REVOKE EXECUTE ON FUNCTION public.ventas_convertir_orden_a_factura(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ventas_convertir_orden_a_factura(uuid,text,text) TO authenticated;

-- ============ Convertir OV → Guía ============
CREATE OR REPLACE FUNCTION public.ventas_convertir_orden_a_guia(p_ov uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_ov record; v_gr uuid; v_cod text; v_num integer; v_email text; v_ubic uuid;
BEGIN
  SELECT * INTO v_ov FROM public.ventas_ordenes WHERE id = p_ov;
  IF v_ov IS NULL THEN RAISE EXCEPTION 'Orden no existe'; END IF;
  v_cod := public.ventas_next_codigo('T001');
  v_num := (regexp_replace(v_cod, '^T001-', ''))::integer;
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  INSERT INTO public.ventas_guias(serie, numero, codigo, orden_id, cliente_id, motivo_traslado, observaciones, usuario_id, usuario_nombre)
    VALUES ('T001', v_num, v_cod, p_ov, v_ov.cliente_id, 'VENTA', v_ov.observaciones, auth.uid(), v_email)
    RETURNING id INTO v_gr;
  INSERT INTO public.ventas_guia_items(guia_id, orden_item_id, producto_id, descripcion, cantidad_cajas, empaque, lote_id, ubicacion_id, orden)
    SELECT v_gr, i.id, i.producto_id, i.descripcion,
      GREATEST(COALESCE(i.cantidad_cajas,0) - COALESCE(i.cantidad_despachada_cajas,0), 0),
      i.empaque,
      COALESCE(i.lote_id,
        (SELECT l.id FROM public.lotes l JOIN public.stock_lote_ubicacion s ON s.lote_id = l.id
          WHERE l.producto_id = i.producto_id AND s.cantidad_cajas > 0 ORDER BY l.fecha_vencimiento ASC LIMIT 1)),
      COALESCE(i.ubicacion_id,
        (SELECT s.ubicacion_id FROM public.stock_lote_ubicacion s
          WHERE s.lote_id = COALESCE(i.lote_id, (SELECT l.id FROM public.lotes l JOIN public.stock_lote_ubicacion s2 ON s2.lote_id=l.id WHERE l.producto_id=i.producto_id AND s2.cantidad_cajas>0 ORDER BY l.fecha_vencimiento ASC LIMIT 1))
            AND s.cantidad_cajas > 0 ORDER BY s.cantidad_cajas DESC LIMIT 1)),
      i.orden
    FROM public.ventas_orden_items i WHERE i.orden_id = p_ov
      AND COALESCE(i.cantidad_cajas,0) - COALESCE(i.cantidad_despachada_cajas,0) > 0
    ORDER BY i.orden NULLS LAST;
  RETURN v_gr;
END $$;
REVOKE EXECUTE ON FUNCTION public.ventas_convertir_orden_a_guia(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ventas_convertir_orden_a_guia(uuid) TO authenticated;

-- ============ Emitir guía (descuenta stock) ============
CREATE OR REPLACE FUNCTION public.ventas_emitir_guia(p_guia uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE g record; it record; v_mov uuid; v_ov_id uuid;
BEGIN
  SELECT * INTO g FROM public.ventas_guias WHERE id = p_guia FOR UPDATE;
  IF g IS NULL THEN RAISE EXCEPTION 'Guía no existe'; END IF;
  IF g.estado <> 'BORRADOR' THEN RAISE EXCEPTION 'Solo se puede emitir una guía en BORRADOR'; END IF;

  FOR it IN SELECT * FROM public.ventas_guia_items WHERE guia_id = p_guia LOOP
    IF it.cantidad_cajas IS NULL OR it.cantidad_cajas < 0 THEN
      RAISE EXCEPTION 'Cantidad inválida en línea %', it.descripcion;
    END IF;
    v_mov := public.registrar_movimiento(
      'SALIDA'::tipo_mov_t,
      it.lote_id,
      it.cantidad_cajas,
      it.ubicacion_id,
      NULL,
      g.cliente_id,
      g.codigo,
      NULL,
      'Salida de venta',
      g.fecha_emision,
      'Guía ' || g.codigo,
      NULL,
      it.latas,
      NULL,
      NULL,
      NULL,
      g.transportista,
      it.empaque,
      false,
      NULL
    );
    UPDATE public.ventas_guia_items SET movimiento_id = v_mov WHERE id = it.id;
    UPDATE public.movimientos SET guia_id = p_guia WHERE id = v_mov;
    IF it.orden_item_id IS NOT NULL THEN
      UPDATE public.ventas_orden_items
        SET cantidad_despachada_cajas = COALESCE(cantidad_despachada_cajas,0) + it.cantidad_cajas
        WHERE id = it.orden_item_id;
    END IF;
  END LOOP;

  UPDATE public.ventas_guias SET estado='EMITIDA', emitida_at = now() WHERE id = p_guia;

  IF g.orden_id IS NOT NULL THEN
    v_ov_id := g.orden_id;
    IF NOT EXISTS (
      SELECT 1 FROM public.ventas_orden_items
       WHERE orden_id = v_ov_id
         AND COALESCE(cantidad_despachada_cajas,0) < COALESCE(cantidad_cajas,0)
    ) THEN
      UPDATE public.ventas_ordenes SET estado='DESPACHADA' WHERE id = v_ov_id AND estado NOT IN ('FACTURADA','ANULADA');
    ELSE
      UPDATE public.ventas_ordenes SET estado='PARCIAL' WHERE id = v_ov_id AND estado NOT IN ('FACTURADA','DESPACHADA','ANULADA');
    END IF;
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.ventas_emitir_guia(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ventas_emitir_guia(uuid) TO authenticated;

-- ============ Anular guía / factura ============
CREATE OR REPLACE FUNCTION public.ventas_anular_guia(p_guia uuid, p_motivo text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE g record; it record;
BEGIN
  IF NOT public.has_role(auth.uid(),'ADMIN') THEN RAISE EXCEPTION 'Solo ADMIN'; END IF;
  SELECT * INTO g FROM public.ventas_guias WHERE id = p_guia FOR UPDATE;
  IF g IS NULL THEN RAISE EXCEPTION 'Guía no existe'; END IF;
  IF g.estado = 'EMITIDA' THEN
    FOR it IN SELECT * FROM public.ventas_guia_items WHERE guia_id = p_guia AND movimiento_id IS NOT NULL LOOP
      PERFORM public.admin_eliminar_movimiento(it.movimiento_id);
      IF it.orden_item_id IS NOT NULL THEN
        UPDATE public.ventas_orden_items
          SET cantidad_despachada_cajas = GREATEST(COALESCE(cantidad_despachada_cajas,0) - it.cantidad_cajas, 0)
          WHERE id = it.orden_item_id;
      END IF;
    END LOOP;
  END IF;
  UPDATE public.ventas_guias SET estado='ANULADA', observaciones = COALESCE(observaciones,'') || ' [ANULADA: ' || COALESCE(p_motivo,'') || ']' WHERE id = p_guia;
END $$;
REVOKE EXECUTE ON FUNCTION public.ventas_anular_guia(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ventas_anular_guia(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.ventas_anular_factura(p_fac uuid, p_motivo text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'ADMIN') THEN RAISE EXCEPTION 'Solo ADMIN'; END IF;
  UPDATE public.ventas_facturas SET estado='ANULADA', observaciones = COALESCE(observaciones,'') || ' [ANULADA: ' || COALESCE(p_motivo,'') || ']' WHERE id = p_fac;
END $$;
REVOKE EXECUTE ON FUNCTION public.ventas_anular_factura(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ventas_anular_factura(uuid,text) TO authenticated;

-- Índices
CREATE INDEX idx_cot_it_cot ON public.ventas_cot_items(cotizacion_id);
CREATE INDEX idx_ov_it_ov ON public.ventas_orden_items(orden_id);
CREATE INDEX idx_fac_it_fac ON public.ventas_factura_items(factura_id);
CREATE INDEX idx_gr_it_gr ON public.ventas_guia_items(guia_id);
CREATE INDEX idx_cot_cli ON public.ventas_cotizaciones(cliente_id);
CREATE INDEX idx_ov_cli ON public.ventas_ordenes(cliente_id);
CREATE INDEX idx_fac_cli ON public.ventas_facturas(cliente_id);
CREATE INDEX idx_gr_cli ON public.ventas_guias(cliente_id);
