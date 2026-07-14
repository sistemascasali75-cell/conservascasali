
-- 1. Roles
CREATE TYPE public.app_role AS ENUM ('ADMIN','SUPERVISOR','ALMACENERO');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

CREATE OR REPLACE FUNCTION public.is_supervisor_or_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('ADMIN','SUPERVISOR')) $$;

CREATE POLICY "users see own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'ADMIN'));
CREATE POLICY "admin manage roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(),'ADMIN')) WITH CHECK (public.has_role(auth.uid(),'ADMIN'));

-- Trigger: first user becomes ADMIN, rest ALMACENERO
CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles) THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'ADMIN');
  ELSE
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'ALMACENERO');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_created_role ON auth.users;
CREATE TRIGGER on_auth_user_created_role AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_role();

-- Backfill: existing users → first is ADMIN, rest ALMACENERO
INSERT INTO public.user_roles(user_id, role)
SELECT id, CASE WHEN row_number() OVER (ORDER BY created_at) = 1 THEN 'ADMIN'::app_role ELSE 'ALMACENERO'::app_role END
FROM auth.users WHERE id NOT IN (SELECT user_id FROM public.user_roles);

-- Vista de usuarios (email visible)
CREATE OR REPLACE VIEW public.v_usuarios AS
SELECT u.id, u.email, COALESCE(array_agg(ur.role) FILTER (WHERE ur.role IS NOT NULL), '{}') AS roles
FROM auth.users u LEFT JOIN public.user_roles ur ON ur.user_id = u.id
GROUP BY u.id, u.email;
GRANT SELECT ON public.v_usuarios TO authenticated;

-- 2. Reescribir RLS de catálogos/operativas por rol
DROP POLICY IF EXISTS "auth all productos" ON public.productos;
CREATE POLICY "rd productos" ON public.productos FOR SELECT TO authenticated USING (true);
CREATE POLICY "wr productos" ON public.productos FOR ALL TO authenticated USING (public.is_supervisor_or_admin(auth.uid())) WITH CHECK (public.is_supervisor_or_admin(auth.uid()));

DROP POLICY IF EXISTS "auth all almacenes" ON public.almacenes;
CREATE POLICY "rd almacenes" ON public.almacenes FOR SELECT TO authenticated USING (true);
CREATE POLICY "wr almacenes" ON public.almacenes FOR ALL TO authenticated USING (public.is_supervisor_or_admin(auth.uid())) WITH CHECK (public.is_supervisor_or_admin(auth.uid()));

DROP POLICY IF EXISTS "auth all ubicaciones" ON public.ubicaciones;
CREATE POLICY "rd ubicaciones" ON public.ubicaciones FOR SELECT TO authenticated USING (true);
CREATE POLICY "wr ubicaciones" ON public.ubicaciones FOR ALL TO authenticated USING (public.is_supervisor_or_admin(auth.uid())) WITH CHECK (public.is_supervisor_or_admin(auth.uid()));

DROP POLICY IF EXISTS "auth all cp" ON public.clientes_proveedores;
CREATE POLICY "rd cp" ON public.clientes_proveedores FOR SELECT TO authenticated USING (true);
CREATE POLICY "wr cp" ON public.clientes_proveedores FOR ALL TO authenticated USING (public.is_supervisor_or_admin(auth.uid())) WITH CHECK (public.is_supervisor_or_admin(auth.uid()));

DROP POLICY IF EXISTS "auth all warrants" ON public.warrants;
CREATE POLICY "rd warrants" ON public.warrants FOR SELECT TO authenticated USING (true);
CREATE POLICY "wr warrants" ON public.warrants FOR ALL TO authenticated USING (public.is_supervisor_or_admin(auth.uid())) WITH CHECK (public.is_supervisor_or_admin(auth.uid()));

-- lotes: lectura todos; escritura supervisor/admin (creación de lote en entrada se hace vía función SECURITY DEFINER más adelante; por ahora permitimos a almaceneros insertar lotes)
DROP POLICY IF EXISTS "auth all lotes" ON public.lotes;
CREATE POLICY "rd lotes" ON public.lotes FOR SELECT TO authenticated USING (true);
CREATE POLICY "ins lotes" ON public.lotes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "upd lotes" ON public.lotes FOR UPDATE TO authenticated USING (public.is_supervisor_or_admin(auth.uid())) WITH CHECK (public.is_supervisor_or_admin(auth.uid()));
CREATE POLICY "del lotes" ON public.lotes FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'ADMIN'));

-- stock_lote_ubicacion: la función registrar_movimiento es SECURITY DEFINER y se encarga; mantenemos lectura abierta y escritura solo via función
DROP POLICY IF EXISTS "auth all stock" ON public.stock_lote_ubicacion;
CREATE POLICY "rd stock" ON public.stock_lote_ubicacion FOR SELECT TO authenticated USING (true);
-- (no policies para INSERT/UPDATE/DELETE — solo SECURITY DEFINER)

-- 3. Lotes: nuevos campos + nuevo estado CERTIFICADO
ALTER TYPE public.estado_lote_t ADD VALUE IF NOT EXISTS 'CERTIFICADO';
ALTER TABLE public.lotes
  ADD COLUMN IF NOT EXISTS costo_por_caja numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fecha_certificacion date,
  ADD COLUMN IF NOT EXISTS certificadora text;

-- 4. Órdenes de etiquetado
CREATE TABLE public.ordenes_etiquetado (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  lote_origen_id uuid NOT NULL REFERENCES public.lotes(id),
  lote_destino_id uuid REFERENCES public.lotes(id),
  etiqueta_destino text NOT NULL,
  cantidad_etiquetada numeric(12,2) NOT NULL CHECK (cantidad_etiquetada > 0),
  merma_proceso numeric(12,2) NOT NULL DEFAULT 0 CHECK (merma_proceso >= 0),
  ubicacion_id uuid NOT NULL REFERENCES public.ubicaciones(id),
  observacion text,
  usuario_id uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.ordenes_etiquetado TO authenticated;
GRANT ALL ON public.ordenes_etiquetado TO service_role;
ALTER TABLE public.ordenes_etiquetado ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rd oe" ON public.ordenes_etiquetado FOR SELECT TO authenticated USING (true);
CREATE POLICY "ins oe" ON public.ordenes_etiquetado FOR INSERT TO authenticated WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.ejecutar_orden_etiquetado(
  p_lote_origen uuid,
  p_etiqueta_destino text,
  p_cantidad_etiquetada numeric,
  p_merma_proceso numeric,
  p_ubicacion uuid,
  p_observacion text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_origen RECORD;
  v_dest_id uuid;
  v_total_salida numeric;
  v_orden_id uuid;
BEGIN
  SELECT * INTO v_origen FROM public.lotes WHERE id = p_lote_origen;
  IF v_origen IS NULL THEN RAISE EXCEPTION 'Lote origen no existe'; END IF;
  IF v_origen.etiqueta IS NOT NULL AND v_origen.etiqueta <> 'S/E' THEN
    RAISE EXCEPTION 'El lote origen ya está etiquetado (%)', v_origen.etiqueta;
  END IF;
  v_total_salida := p_cantidad_etiquetada + COALESCE(p_merma_proceso,0);

  -- Encontrar o crear lote destino (mismo producto/FP/FV, etiqueta destino)
  SELECT id INTO v_dest_id FROM public.lotes
    WHERE producto_id = v_origen.producto_id
      AND fecha_produccion = v_origen.fecha_produccion
      AND fecha_vencimiento = v_origen.fecha_vencimiento
      AND etiqueta = p_etiqueta_destino;
  IF v_dest_id IS NULL THEN
    INSERT INTO public.lotes(producto_id, fecha_produccion, fecha_vencimiento, etiqueta, estado, costo_por_caja, mercado, observacion)
    VALUES (v_origen.producto_id, v_origen.fecha_produccion, v_origen.fecha_vencimiento, p_etiqueta_destino, v_origen.estado, v_origen.costo_por_caja, v_origen.mercado, 'Etiquetado desde ' || v_origen.codigo_lote)
    RETURNING id INTO v_dest_id;
  END IF;

  -- Salida del origen (cantidad etiquetada): TRASLADO contable (sale ubicación origen, no entra a otra del mismo lote)
  -- Hacemos: AJUSTE_NEGATIVO sobre origen por el total, AJUSTE_POSITIVO sobre destino por la cantidad etiquetada
  PERFORM public.registrar_movimiento('AJUSTE_NEGATIVO'::tipo_mov_t, p_lote_origen, v_total_salida, p_ubicacion, NULL, NULL, NULL, NULL, 'ETIQUETADO origen → ' || p_etiqueta_destino);
  PERFORM public.registrar_movimiento('AJUSTE_POSITIVO'::tipo_mov_t, v_dest_id, p_cantidad_etiquetada, NULL, p_ubicacion, NULL, NULL, NULL, 'ETIQUETADO destino ' || p_etiqueta_destino);

  INSERT INTO public.ordenes_etiquetado(lote_origen_id, lote_destino_id, etiqueta_destino, cantidad_etiquetada, merma_proceso, ubicacion_id, observacion, usuario_id)
  VALUES (p_lote_origen, v_dest_id, p_etiqueta_destino, p_cantidad_etiquetada, COALESCE(p_merma_proceso,0), p_ubicacion, p_observacion, auth.uid())
  RETURNING id INTO v_orden_id;
  RETURN v_orden_id;
END $$;

-- 5. Inventarios físicos
CREATE TYPE public.estado_inv_fisico_t AS ENUM ('BORRADOR','EN_CONTEO','PENDIENTE_APROBACION','APROBADO','CANCELADO');

CREATE TABLE public.inventarios_fisicos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero serial,
  almacen_id uuid NOT NULL REFERENCES public.almacenes(id),
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  estado public.estado_inv_fisico_t NOT NULL DEFAULT 'EN_CONTEO',
  usuario_id uuid REFERENCES auth.users(id),
  supervisor_id uuid REFERENCES auth.users(id),
  observacion text,
  created_at timestamptz NOT NULL DEFAULT now(),
  aprobado_at timestamptz
);
GRANT SELECT, INSERT, UPDATE ON public.inventarios_fisicos TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE inventarios_fisicos_numero_seq TO authenticated;
GRANT ALL ON public.inventarios_fisicos TO service_role;
ALTER TABLE public.inventarios_fisicos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rd if" ON public.inventarios_fisicos FOR SELECT TO authenticated USING (true);
CREATE POLICY "ins if" ON public.inventarios_fisicos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "upd if" ON public.inventarios_fisicos FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.inventario_conteo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventario_id uuid NOT NULL REFERENCES public.inventarios_fisicos(id) ON DELETE CASCADE,
  lote_id uuid NOT NULL REFERENCES public.lotes(id),
  ubicacion_id uuid NOT NULL REFERENCES public.ubicaciones(id),
  cantidad_esperada numeric(12,2) NOT NULL DEFAULT 0,
  cantidad_contada numeric(12,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(inventario_id, lote_id, ubicacion_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventario_conteo TO authenticated;
GRANT ALL ON public.inventario_conteo TO service_role;
ALTER TABLE public.inventario_conteo ENABLE ROW LEVEL SECURITY;
CREATE POLICY "all ic" ON public.inventario_conteo FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Crear toma física: precarga todas las ubicaciones del almacén con lotes existentes
CREATE OR REPLACE FUNCTION public.crear_inventario_fisico(p_almacen uuid, p_observacion text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.inventarios_fisicos(almacen_id, observacion, usuario_id)
  VALUES (p_almacen, p_observacion, auth.uid()) RETURNING id INTO v_id;

  INSERT INTO public.inventario_conteo(inventario_id, lote_id, ubicacion_id, cantidad_esperada)
  SELECT v_id, s.lote_id, s.ubicacion_id, s.cantidad_cajas
  FROM public.stock_lote_ubicacion s
  JOIN public.ubicaciones u ON u.id = s.ubicacion_id
  WHERE u.almacen_id = p_almacen AND s.cantidad_cajas > 0;

  RETURN v_id;
END $$;

-- Aprobar: solo supervisor/admin
CREATE OR REPLACE FUNCTION public.aprobar_inventario(p_inventario uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r RECORD;
  v_real numeric;
  v_diff numeric;
  v_num integer;
  v_ajustes integer := 0;
BEGIN
  IF NOT public.is_supervisor_or_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Solo supervisores o administradores pueden aprobar tomas físicas';
  END IF;

  SELECT numero INTO v_num FROM public.inventarios_fisicos WHERE id = p_inventario;
  IF v_num IS NULL THEN RAISE EXCEPTION 'Inventario no existe'; END IF;

  -- Diferencias contra stock actual
  FOR r IN SELECT lote_id, ubicacion_id, COALESCE(cantidad_contada,0) AS contada
           FROM public.inventario_conteo WHERE inventario_id = p_inventario LOOP
    SELECT COALESCE(cantidad_cajas,0) INTO v_real FROM public.stock_lote_ubicacion
      WHERE lote_id = r.lote_id AND ubicacion_id = r.ubicacion_id;
    v_real := COALESCE(v_real, 0);
    v_diff := r.contada - v_real;
    IF v_diff > 0 THEN
      PERFORM public.registrar_movimiento('AJUSTE_POSITIVO'::tipo_mov_t, r.lote_id, v_diff, NULL, r.ubicacion_id, NULL, NULL, NULL, 'TOMA DE INVENTARIO #' || v_num);
      v_ajustes := v_ajustes + 1;
    ELSIF v_diff < 0 THEN
      PERFORM public.registrar_movimiento('AJUSTE_NEGATIVO'::tipo_mov_t, r.lote_id, -v_diff, r.ubicacion_id, NULL, NULL, NULL, NULL, 'TOMA DE INVENTARIO #' || v_num);
      v_ajustes := v_ajustes + 1;
    END IF;
  END LOOP;

  UPDATE public.inventarios_fisicos SET estado='APROBADO', supervisor_id=auth.uid(), aprobado_at=now() WHERE id = p_inventario;
  RETURN v_ajustes;
END $$;

-- 6. Reescribir registrar_movimiento: bloquear salidas externas de lotes no certificados
CREATE OR REPLACE FUNCTION public.registrar_movimiento(p_tipo tipo_mov_t, p_lote_id uuid, p_cantidad numeric, p_ubic_origen uuid DEFAULT NULL::uuid, p_ubic_destino uuid DEFAULT NULL::uuid, p_cliente_proveedor uuid DEFAULT NULL::uuid, p_nro_guia text DEFAULT NULL::text, p_nro_vale text DEFAULT NULL::text, p_motivo text DEFAULT NULL::text, p_fecha date DEFAULT CURRENT_DATE)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_stock NUMERIC;
  v_warrant NUMERIC;
  v_total_lote NUMERIC;
  v_mov_id UUID;
  v_estado estado_lote_t;
BEGIN
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN RAISE EXCEPTION 'La cantidad debe ser mayor a 0'; END IF;

  -- Validación de certificación: SALIDA a cliente requiere CERTIFICADO
  IF p_tipo = 'SALIDA' THEN
    SELECT estado INTO v_estado FROM lotes WHERE id = p_lote_id;
    IF v_estado <> 'CERTIFICADO' THEN
      RAISE EXCEPTION 'No se permite la salida: el lote no está CERTIFICADO (estado actual: %)', v_estado;
    END IF;
  END IF;

  IF p_tipo IN ('SALIDA','MERMA','AJUSTE_NEGATIVO') THEN
    IF p_ubic_origen IS NULL THEN RAISE EXCEPTION 'Ubicación de origen requerida'; END IF;
    SELECT COALESCE(cantidad_cajas,0) INTO v_stock FROM stock_lote_ubicacion
      WHERE lote_id = p_lote_id AND ubicacion_id = p_ubic_origen;
    IF v_stock IS NULL THEN v_stock := 0; END IF;
    IF v_stock < p_cantidad THEN
      RAISE EXCEPTION 'Stock insuficiente. Disponible en ubicación: % cajas, solicitado: %', v_stock, p_cantidad;
    END IF;
    SELECT COALESCE(SUM(cantidad_cajas_warrant),0) INTO v_warrant FROM warrants
      WHERE lote_id = p_lote_id AND estado='ACTIVO';
    SELECT COALESCE(SUM(cantidad_cajas),0) INTO v_total_lote FROM stock_lote_ubicacion
      WHERE lote_id = p_lote_id;
    IF (v_total_lote - p_cantidad) < v_warrant THEN
      RAISE EXCEPTION 'Operación bloqueada por warrant. Total lote: %, comprometido: %, intentando dejar: %', v_total_lote, v_warrant, (v_total_lote - p_cantidad);
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
    IF p_ubic_origen IS NULL OR p_ubic_destino IS NULL THEN RAISE EXCEPTION 'Traslado requiere ubicación origen y destino'; END IF;
    SELECT COALESCE(cantidad_cajas,0) INTO v_stock FROM stock_lote_ubicacion
      WHERE lote_id = p_lote_id AND ubicacion_id = p_ubic_origen;
    IF v_stock IS NULL OR v_stock < p_cantidad THEN RAISE EXCEPTION 'Stock insuficiente en origen. Disponible: % cajas', COALESCE(v_stock,0); END IF;
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
END $function$;
