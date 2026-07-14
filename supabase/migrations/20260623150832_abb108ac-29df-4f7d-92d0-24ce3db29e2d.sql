
-- 1. Catálogo Estados
CREATE TABLE public.estados (
  nombre TEXT PRIMARY KEY,
  observacion TEXT,
  orden INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.estados TO authenticated;
GRANT ALL ON public.estados TO service_role;
ALTER TABLE public.estados ENABLE ROW LEVEL SECURITY;
CREATE POLICY "estados read" ON public.estados FOR SELECT TO authenticated USING (true);
CREATE POLICY "estados write admin" ON public.estados FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'ADMIN')) WITH CHECK (public.has_role(auth.uid(),'ADMIN'));
CREATE TRIGGER trg_estados_upd BEFORE UPDATE ON public.estados FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

INSERT INTO public.estados(nombre, orden, observacion) VALUES
  ('DISPONIBLE', 1, 'Stock listo para operar'),
  ('INMOVILIZADO', 2, 'Bloqueado por warrant u otro'),
  ('POR_CERTIFICAR', 3, 'Pendiente de certificación'),
  ('EN_PROCESO', 4, 'En proceso productivo'),
  ('CUARENTENA', 5, 'En cuarentena'),
  ('CERTIFICADO', 6, 'Certificado, apto para salida');

-- 2. Drop vista dependiente, convertir columnas, recrear vista
DROP VIEW IF EXISTS public.v_stock_lote;

ALTER TABLE public.lotes ALTER COLUMN estado DROP DEFAULT;
ALTER TABLE public.lotes ALTER COLUMN estado TYPE TEXT USING estado::TEXT;
ALTER TABLE public.lotes ALTER COLUMN estado SET DEFAULT 'DISPONIBLE';

ALTER TABLE public.movimientos ALTER COLUMN estado_lote TYPE TEXT USING estado_lote::TEXT;

CREATE VIEW public.v_stock_lote AS
SELECT l.id AS lote_id, l.codigo_lote, l.producto_id, l.fecha_produccion, l.fecha_vencimiento,
       l.estado, l.etiqueta, l.mercado,
       COALESCE(s.total, 0::numeric) AS stock_total,
       COALESCE(w.total_warrant, 0::numeric) AS comprometido_warrant,
       (COALESCE(s.total, 0::numeric) - COALESCE(w.total_warrant, 0::numeric)) AS holgura
FROM lotes l
LEFT JOIN (SELECT lote_id, sum(cantidad_cajas) AS total FROM stock_lote_ubicacion GROUP BY lote_id) s ON s.lote_id = l.id
LEFT JOIN (SELECT lote_id, sum(cantidad_cajas_warrant) AS total_warrant FROM warrants WHERE estado='ACTIVO' GROUP BY lote_id) w ON w.lote_id = l.id;
GRANT SELECT ON public.v_stock_lote TO authenticated;

-- 3. Drop overloads antiguos y recrear registrar_movimiento como TEXT
DROP FUNCTION IF EXISTS public.registrar_movimiento(tipo_mov_t,uuid,numeric,uuid,uuid,uuid,text,text,text,date);
DROP FUNCTION IF EXISTS public.registrar_movimiento(tipo_mov_t,uuid,numeric,uuid,uuid,uuid,text,text,text,date,text,text);
DROP FUNCTION IF EXISTS public.registrar_movimiento(tipo_mov_t,uuid,numeric,uuid,uuid,uuid,text,text,text,date,text,text,integer);

CREATE OR REPLACE FUNCTION public.registrar_movimiento(
  p_tipo tipo_mov_t, p_lote_id uuid, p_cantidad numeric,
  p_ubic_origen uuid DEFAULT NULL, p_ubic_destino uuid DEFAULT NULL,
  p_cliente_proveedor uuid DEFAULT NULL, p_nro_guia text DEFAULT NULL,
  p_nro_vale text DEFAULT NULL, p_motivo text DEFAULT NULL,
  p_fecha date DEFAULT CURRENT_DATE, p_observaciones text DEFAULT NULL,
  p_nro_warrant text DEFAULT NULL, p_latas integer DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_stock NUMERIC; v_warrant NUMERIC; v_total_lote NUMERIC;
  v_mov_id UUID; v_lote RECORD; v_certificacion TEXT;
  v_tiene_warrant BOOLEAN; v_tiene_etiqueta BOOLEAN;
BEGIN
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN RAISE EXCEPTION 'La cantidad debe ser mayor a 0'; END IF;
  SELECT * INTO v_lote FROM lotes WHERE id = p_lote_id;
  IF v_lote IS NULL THEN RAISE EXCEPTION 'Lote no existe'; END IF;
  IF p_tipo = 'SALIDA' AND v_lote.estado <> 'CERTIFICADO' THEN
    RAISE EXCEPTION 'No se permite la salida: el lote no está CERTIFICADO (estado actual: %)', v_lote.estado;
  END IF;

  IF p_tipo IN ('SALIDA','MERMA','AJUSTE_NEGATIVO') THEN
    IF p_ubic_origen IS NULL THEN RAISE EXCEPTION 'Ubicación de origen requerida'; END IF;
    SELECT COALESCE(cantidad_cajas,0) INTO v_stock FROM stock_lote_ubicacion WHERE lote_id=p_lote_id AND ubicacion_id=p_ubic_origen;
    IF v_stock IS NULL THEN v_stock := 0; END IF;
    IF v_stock < p_cantidad THEN RAISE EXCEPTION 'Stock insuficiente. Disponible: %, solicitado: %', v_stock, p_cantidad; END IF;
    SELECT COALESCE(SUM(cantidad_cajas_warrant),0) INTO v_warrant FROM warrants WHERE lote_id=p_lote_id AND estado='ACTIVO';
    SELECT COALESCE(SUM(cantidad_cajas),0) INTO v_total_lote FROM stock_lote_ubicacion WHERE lote_id=p_lote_id;
    IF (v_total_lote - p_cantidad) < v_warrant THEN RAISE EXCEPTION 'Bloqueado por warrant. Total: %, comprometido: %', v_total_lote, v_warrant; END IF;
    UPDATE stock_lote_ubicacion SET cantidad_cajas = cantidad_cajas - p_cantidad, updated_at=now()
      WHERE lote_id=p_lote_id AND ubicacion_id=p_ubic_origen;
  ELSIF p_tipo IN ('ENTRADA','AJUSTE_POSITIVO') THEN
    IF p_ubic_destino IS NULL THEN RAISE EXCEPTION 'Ubicación de destino requerida'; END IF;
    INSERT INTO stock_lote_ubicacion(lote_id, ubicacion_id, cantidad_cajas)
      VALUES (p_lote_id, p_ubic_destino, p_cantidad)
      ON CONFLICT (lote_id, ubicacion_id)
      DO UPDATE SET cantidad_cajas = stock_lote_ubicacion.cantidad_cajas + p_cantidad, updated_at=now();
  ELSIF p_tipo = 'TRASLADO' THEN
    IF p_ubic_origen IS NULL OR p_ubic_destino IS NULL THEN RAISE EXCEPTION 'Traslado requiere origen y destino'; END IF;
    SELECT COALESCE(cantidad_cajas,0) INTO v_stock FROM stock_lote_ubicacion WHERE lote_id=p_lote_id AND ubicacion_id=p_ubic_origen;
    IF v_stock IS NULL OR v_stock < p_cantidad THEN RAISE EXCEPTION 'Stock insuficiente en origen: %', COALESCE(v_stock,0); END IF;
    UPDATE stock_lote_ubicacion SET cantidad_cajas = cantidad_cajas - p_cantidad, updated_at=now()
      WHERE lote_id=p_lote_id AND ubicacion_id=p_ubic_origen;
    INSERT INTO stock_lote_ubicacion(lote_id, ubicacion_id, cantidad_cajas)
      VALUES (p_lote_id, p_ubic_destino, p_cantidad)
      ON CONFLICT (lote_id, ubicacion_id)
      DO UPDATE SET cantidad_cajas = stock_lote_ubicacion.cantidad_cajas + p_cantidad, updated_at=now();
  END IF;

  v_certificacion := NULLIF(trim(both ' ' FROM concat_ws(' · ', v_lote.certificadora, to_char(v_lote.fecha_certificacion,'DD-MM-YYYY'))),'');
  v_tiene_etiqueta := v_lote.etiqueta IS NOT NULL AND v_lote.etiqueta <> 'S/E';
  IF p_nro_warrant IS NOT NULL AND length(trim(p_nro_warrant)) > 0 THEN
    v_tiene_warrant := true;
  ELSE
    SELECT EXISTS (SELECT 1 FROM warrants WHERE lote_id=p_lote_id AND estado='ACTIVO') INTO v_tiene_warrant;
  END IF;

  INSERT INTO movimientos(
    tipo, fecha, lote_id, ubicacion_origen_id, ubicacion_destino_id,
    cantidad_cajas, nro_guia, nro_vale, cliente_proveedor_id, motivo, usuario_id,
    nro_warrant, tiene_warrant, mercado, observaciones, certificacion,
    etiqueta, tiene_etiqueta, estado_lote, latas
  ) VALUES (
    p_tipo, p_fecha, p_lote_id, p_ubic_origen, p_ubic_destino,
    p_cantidad, p_nro_guia, p_nro_vale, p_cliente_proveedor, p_motivo, auth.uid(),
    NULLIF(trim(p_nro_warrant),''), v_tiene_warrant, v_lote.mercado,
    NULLIF(trim(p_observaciones),''), v_certificacion,
    v_lote.etiqueta, v_tiene_etiqueta, v_lote.estado, p_latas
  ) RETURNING id INTO v_mov_id;
  RETURN v_mov_id;
END $$;

-- 4. Helper para crear/actualizar lote (evita problemas RLS update para no-admin)
CREATE OR REPLACE FUNCTION public.upsert_lote(p_producto uuid, p_fp date, p_fv date, p_estado text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.lotes
   WHERE producto_id=p_producto AND fecha_produccion=p_fp AND fecha_vencimiento=p_fv;
  IF v_id IS NULL THEN
    INSERT INTO public.lotes(producto_id, fecha_produccion, fecha_vencimiento, estado)
    VALUES (p_producto, p_fp, p_fv, COALESCE(NULLIF(p_estado,''),'DISPONIBLE'))
    RETURNING id INTO v_id;
  ELSIF p_estado IS NOT NULL AND p_estado <> '' THEN
    UPDATE public.lotes SET estado=p_estado WHERE id=v_id;
  END IF;
  RETURN v_id;
END $$;

-- 5. Eliminar registros de catálogos (solo ADMIN)
CREATE OR REPLACE FUNCTION public.admin_delete_catalogo(p_tabla text, p_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'ADMIN') THEN RAISE EXCEPTION 'Solo ADMIN'; END IF;
  IF p_tabla = 'productos' THEN DELETE FROM public.productos WHERE id::text = p_id;
  ELSIF p_tabla = 'almacenes' THEN DELETE FROM public.almacenes WHERE id::text = p_id;
  ELSIF p_tabla = 'ubicaciones' THEN DELETE FROM public.ubicaciones WHERE id::text = p_id;
  ELSIF p_tabla = 'clientes_proveedores' THEN DELETE FROM public.clientes_proveedores WHERE id::text = p_id;
  ELSIF p_tabla = 'estados' THEN DELETE FROM public.estados WHERE nombre = p_id;
  ELSE RAISE EXCEPTION 'Tabla no permitida'; END IF;
END $$;
