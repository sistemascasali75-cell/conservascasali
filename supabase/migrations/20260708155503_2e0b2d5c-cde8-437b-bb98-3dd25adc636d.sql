
-- 1) Drop views that depend on mercado_t
DROP VIEW IF EXISTS public.v_stock_disponible_fefo;
DROP VIEW IF EXISTS public.v_stock_lote;

-- 2) Convert lotes.mercado from enum to text (values from catálogo mercados)
ALTER TABLE public.lotes ALTER COLUMN mercado TYPE text USING mercado::text;

-- 3) Drop movimientos.mercado (redundant; se usa mercado_id -> catálogo)
ALTER TABLE public.movimientos DROP COLUMN IF EXISTS mercado;

-- 4) Drop enum type if no longer used
DROP TYPE IF EXISTS public.mercado_t;

-- 5) Recreate views
CREATE VIEW public.v_stock_disponible_fefo AS
SELECT s.lote_id, s.ubicacion_id, l.producto_id, s.cantidad_cajas,
  l.fecha_vencimiento, l.codigo_lote, l.estado, l.etiqueta, l.mercado
FROM public.stock_lote_ubicacion s
JOIN public.lotes l ON l.id = s.lote_id
WHERE s.cantidad_cajas > 0 AND l.estado = 'BUENAS'
ORDER BY l.fecha_vencimiento;

CREATE VIEW public.v_stock_lote AS
SELECT l.id AS lote_id, l.codigo_lote, l.producto_id, l.fecha_produccion,
  l.fecha_vencimiento, l.estado, l.etiqueta, l.mercado,
  COALESCE(s.total, 0) AS stock_total,
  COALESCE(w.total_warrant, 0) AS comprometido_warrant,
  (COALESCE(s.total, 0) - COALESCE(w.total_warrant, 0)) AS holgura
FROM public.lotes l
LEFT JOIN (SELECT lote_id, sum(cantidad_cajas) AS total
             FROM public.stock_lote_ubicacion GROUP BY lote_id) s ON s.lote_id = l.id
LEFT JOIN (SELECT lote_id, sum(cantidad_cajas_warrant) AS total_warrant
             FROM public.warrants WHERE estado='ACTIVO'::estado_warrant_t GROUP BY lote_id) w ON w.lote_id = l.id;

GRANT SELECT ON public.v_stock_disponible_fefo TO authenticated, service_role;
GRANT SELECT ON public.v_stock_lote TO authenticated, service_role;

-- 6) upsert_lote: aceptar p_mercado para guardar mercado (nombre del catálogo)
CREATE OR REPLACE FUNCTION public.upsert_lote(p_producto uuid, p_fp date, p_fv date, p_estado text, p_mercado text DEFAULT NULL)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_id uuid; v_codigo_base text; v_codigo_lote text;
BEGIN
  SELECT id INTO v_id FROM public.lotes
   WHERE producto_id = p_producto AND fecha_produccion = p_fp AND fecha_vencimiento = p_fv;

  IF v_id IS NULL THEN
    SELECT codigo_base INTO v_codigo_base FROM public.productos WHERE id = p_producto;
    IF v_codigo_base IS NULL THEN RAISE EXCEPTION 'Producto no existe'; END IF;
    v_codigo_lote := v_codigo_base || ' FP:' || to_char(p_fp,'DD MM YYYY') || ' FV:' || to_char(p_fv,'DD MM YYYY');
    INSERT INTO public.lotes(producto_id, fecha_produccion, fecha_vencimiento, codigo_lote, estado, mercado)
    VALUES (p_producto, p_fp, p_fv, v_codigo_lote, COALESCE(NULLIF(p_estado,''),'DISPONIBLE'), NULLIF(p_mercado,''))
    RETURNING id INTO v_id;
  ELSE
    IF p_estado IS NOT NULL AND p_estado <> '' THEN
      UPDATE public.lotes SET estado = p_estado WHERE id = v_id;
    END IF;
    IF p_mercado IS NOT NULL AND p_mercado <> '' THEN
      UPDATE public.lotes SET mercado = p_mercado WHERE id = v_id;
    END IF;
  END IF;
  RETURN v_id;
END; $function$;

-- 7) registrar_movimiento: quitar referencia a columna mercado (enum) en INSERT
CREATE OR REPLACE FUNCTION public.registrar_movimiento(p_tipo tipo_mov_t, p_lote_id uuid, p_cantidad numeric DEFAULT 0, p_ubic_origen uuid DEFAULT NULL::uuid, p_ubic_destino uuid DEFAULT NULL::uuid, p_cliente_proveedor uuid DEFAULT NULL::uuid, p_nro_guia text DEFAULT NULL::text, p_nro_vale text DEFAULT NULL::text, p_motivo text DEFAULT NULL::text, p_fecha date DEFAULT ((now() AT TIME ZONE 'America/Lima'::text))::date, p_observaciones text DEFAULT NULL::text, p_nro_warrant text DEFAULT NULL::text, p_latas integer DEFAULT NULL::integer, p_piso integer DEFAULT NULL::integer, p_mercado_id uuid DEFAULT NULL::uuid, p_tiene_etiqueta boolean DEFAULT NULL::boolean, p_tercero text DEFAULT NULL::text, p_empaque integer DEFAULT 48, p_donacion boolean DEFAULT false, p_autorizado text DEFAULT NULL::text, p_inicia_warrant date DEFAULT NULL::date, p_vence_warrant date DEFAULT NULL::date)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET "TimeZone" TO 'America/Lima'
AS $function$
DECLARE
  v_stock numeric; v_warrant numeric; v_total_lote numeric; v_mov_id uuid;
  v_lote record; v_certificacion text; v_tiene_warrant boolean;
  v_tiene_etiqueta boolean; v_etiqueta text; v_user_email text;
BEGIN
  IF p_cantidad IS NULL OR p_cantidad < 0 THEN RAISE EXCEPTION 'La cantidad de cajas no puede ser negativa'; END IF;
  IF p_latas IS NOT NULL AND p_latas < 0 THEN RAISE EXCEPTION 'Latas debe ser mayor o igual a 0'; END IF;
  IF p_tipo IN ('SALIDA','MERMA','AJUSTE_NEGATIVO','TRASLADO','CAMBIO') AND p_ubic_origen IS NULL THEN
    RAISE EXCEPTION 'Ubicación origen requerida'; END IF;
  IF p_tipo IN ('ENTRADA','AJUSTE_POSITIVO','TRASLADO') AND p_ubic_destino IS NULL THEN
    RAISE EXCEPTION 'Ubicación destino requerida'; END IF;

  SELECT * INTO v_lote FROM public.lotes WHERE id = p_lote_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lote no encontrado'; END IF;

  v_certificacion := NULLIF(trim(both ' ' FROM concat_ws(' · ', v_lote.certificadora, to_char(v_lote.fecha_certificacion, 'DD-MM-YYYY'))), '');
  v_tiene_warrant := (p_nro_warrant IS NOT NULL AND length(trim(p_nro_warrant)) > 0);
  v_tiene_etiqueta := COALESCE(p_tiene_etiqueta, false);
  v_etiqueta := CASE WHEN v_tiene_etiqueta THEN COALESCE(NULLIF(v_lote.etiqueta, ''), 'CON ETIQUETA') ELSE NULL END;

  SELECT COALESCE(email, '') INTO v_user_email FROM auth.users WHERE id = auth.uid();

  IF p_tipo IN ('SALIDA','TRASLADO','CAMBIO','MERMA','AJUSTE_NEGATIVO') AND p_cantidad > 0 THEN
    SELECT COALESCE(SUM(cantidad_cajas), 0) INTO v_stock
      FROM public.stock_lote_ubicacion WHERE lote_id = p_lote_id AND ubicacion_id = p_ubic_origen;
    IF COALESCE(v_stock, 0) < p_cantidad THEN
      RAISE EXCEPTION 'Stock insuficiente en ubicación origen (% disponibles)', COALESCE(v_stock, 0);
    END IF;
    SELECT COALESCE(SUM(cantidad_cajas), 0) INTO v_total_lote
      FROM public.stock_lote_ubicacion WHERE lote_id = p_lote_id;
    SELECT COALESCE(SUM(cantidad_cajas_warrant), 0) INTO v_warrant
      FROM public.warrants WHERE lote_id = p_lote_id AND estado = 'ACTIVO';
    IF (COALESCE(v_total_lote, 0) - p_cantidad) < COALESCE(v_warrant, 0) THEN
      RAISE EXCEPTION 'No se puede mover: lote tiene % cajas en warrant activo', COALESCE(v_warrant, 0);
    END IF;
  END IF;

  INSERT INTO public.movimientos (
    tipo, fecha, lote_id, ubicacion_origen_id, ubicacion_destino_id,
    cantidad_cajas, latas, piso, cliente_proveedor_id, mercado_id,
    nro_guia, nro_vale, nro_warrant, tiene_warrant, motivo, observaciones,
    usuario_id, usuario_nombre, tiene_etiqueta, etiqueta, certificacion,
    estado_lote, tercero, empaque, donacion, autorizado,
    inicia_warrant, vence_warrant
  ) VALUES (
    p_tipo, COALESCE(p_fecha, ((now() AT TIME ZONE 'America/Lima')::date)),
    p_lote_id, p_ubic_origen, p_ubic_destino, p_cantidad, COALESCE(p_latas, 0),
    p_piso, p_cliente_proveedor, p_mercado_id,
    NULLIF(trim(COALESCE(p_nro_guia, '')), ''),
    NULLIF(trim(COALESCE(p_nro_vale, '')), ''),
    NULLIF(trim(COALESCE(p_nro_warrant, '')), ''),
    v_tiene_warrant,
    NULLIF(trim(COALESCE(p_motivo, '')), ''),
    NULLIF(trim(COALESCE(p_observaciones, '')), ''),
    auth.uid(), v_user_email, v_tiene_etiqueta, v_etiqueta, v_certificacion,
    v_lote.estado,
    NULLIF(trim(COALESCE(p_tercero, '')), ''),
    COALESCE(p_empaque, 48),
    COALESCE(p_donacion, false),
    NULLIF(trim(COALESCE(p_autorizado, '')), ''),
    p_inicia_warrant, p_vence_warrant
  ) RETURNING id INTO v_mov_id;

  RETURN v_mov_id;
END; $function$;

-- 8) admin_editar_movimiento: quitar referencia a mercado (enum)
CREATE OR REPLACE FUNCTION public.admin_editar_movimiento(p_mov uuid, p_tipo tipo_mov_t, p_fecha date, p_lote_id uuid, p_ubic_origen uuid, p_ubic_destino uuid, p_cantidad_cajas numeric, p_latas integer, p_piso integer, p_nro_guia text, p_nro_vale text, p_cliente uuid, p_motivo text, p_observaciones text, p_nro_warrant text, p_mercado_id uuid DEFAULT NULL::uuid, p_tiene_etiqueta boolean DEFAULT NULL::boolean, p_tercero text DEFAULT NULL::text, p_empaque integer DEFAULT NULL::integer, p_donacion boolean DEFAULT NULL::boolean, p_autorizado text DEFAULT NULL::text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  m record; v_lote record; v_certificacion text; v_tiene_etiqueta boolean;
  v_etiqueta text; v_tiene_warrant boolean; v_tipo public.tipo_mov_t;
  v_fecha date; v_lote_id uuid; v_cantidad numeric;
BEGIN
  IF NOT public.has_role(auth.uid(), 'ADMIN') THEN RAISE EXCEPTION 'Solo ADMIN'; END IF;
  SELECT * INTO m FROM public.movimientos WHERE id=p_mov;
  IF m IS NULL THEN RAISE EXCEPTION 'Movimiento no existe'; END IF;
  v_tipo := COALESCE(p_tipo, m.tipo);
  v_fecha := COALESCE(p_fecha, m.fecha);
  v_lote_id := COALESCE(p_lote_id, m.lote_id);
  v_cantidad := COALESCE(p_cantidad_cajas, 0);
  IF v_cantidad < 0 THEN RAISE EXCEPTION 'La cantidad de cajas no puede ser negativa'; END IF;

  SELECT * INTO v_lote FROM public.lotes WHERE id=v_lote_id;
  IF v_lote IS NULL THEN RAISE EXCEPTION 'Lote no existe'; END IF;

  IF v_tipo IN ('SALIDA','MERMA','AJUSTE_NEGATIVO','TRASLADO','CAMBIO') AND p_ubic_origen IS NULL AND v_cantidad > 0 THEN
    RAISE EXCEPTION 'Ubicación origen requerida para %', v_tipo;
  END IF;
  IF v_tipo IN ('ENTRADA','AJUSTE_POSITIVO','TRASLADO') AND p_ubic_destino IS NULL AND v_cantidad > 0 THEN
    RAISE EXCEPTION 'Ubicación destino requerida para %', v_tipo;
  END IF;

  v_certificacion := NULLIF(trim(both ' ' FROM concat_ws(' · ', v_lote.certificadora, to_char(v_lote.fecha_certificacion,'DD-MM-YYYY'))),'');
  v_tiene_etiqueta := COALESCE(p_tiene_etiqueta, m.tiene_etiqueta, v_lote.etiqueta IS NOT NULL AND v_lote.etiqueta <> 'S/E');
  v_etiqueta := CASE WHEN v_tiene_etiqueta THEN COALESCE(NULLIF(v_lote.etiqueta,''), NULLIF(m.etiqueta,''), 'SI') ELSE NULL END;
  v_tiene_warrant := p_nro_warrant IS NOT NULL AND length(trim(p_nro_warrant)) > 0;

  PERFORM set_config('app.bypass_movimientos_block', 'true', true);

  UPDATE public.movimientos
    SET tipo=v_tipo, fecha=v_fecha, lote_id=v_lote_id,
        ubicacion_origen_id=p_ubic_origen, ubicacion_destino_id=p_ubic_destino,
        cantidad_cajas=v_cantidad, latas=COALESCE(p_latas, latas), piso=p_piso,
        nro_guia=NULLIF(trim(COALESCE(p_nro_guia,'')),''),
        nro_vale=NULLIF(trim(COALESCE(p_nro_vale,'')),''),
        cliente_proveedor_id=p_cliente,
        motivo=NULLIF(trim(COALESCE(p_motivo,'')),''),
        observaciones=NULLIF(trim(COALESCE(p_observaciones,'')),''),
        nro_warrant=NULLIF(trim(COALESCE(p_nro_warrant,'')),''),
        tiene_warrant=v_tiene_warrant,
        certificacion=v_certificacion, etiqueta=v_etiqueta,
        tiene_etiqueta=v_tiene_etiqueta, estado_lote=v_lote.estado,
        mercado_id=COALESCE(p_mercado_id, m.mercado_id),
        tercero=NULLIF(trim(COALESCE(p_tercero, m.tercero, '')),''),
        empaque=COALESCE(p_empaque, m.empaque, 48),
        donacion=COALESCE(p_donacion, m.donacion, false),
        autorizado=COALESCE(NULLIF(trim(COALESCE(p_autorizado,'')),''), m.autorizado)
    WHERE id=p_mov;
END; $function$;

-- 9) cambiar_lote: quitar campo mercado en INSERT movimientos
CREATE OR REPLACE FUNCTION public.cambiar_lote(p_lote_origen uuid, p_cantidad numeric, p_ubicacion uuid, p_latas integer DEFAULT NULL::integer, p_producto_destino uuid DEFAULT NULL::uuid, p_fp_destino date DEFAULT NULL::date, p_fv_destino date DEFAULT NULL::date, p_estado_destino text DEFAULT NULL::text, p_observaciones text DEFAULT NULL::text, p_fecha date DEFAULT CURRENT_DATE)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_origen record; v_dest_id uuid; v_codigo_base text; v_codigo_lote text;
  v_stock numeric; v_user_email text; v_mov_out uuid; v_mov_in uuid;
  v_prod uuid; v_fp date; v_fv date; v_estado text;
BEGIN
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN RAISE EXCEPTION 'Cantidad debe ser mayor a 0'; END IF;
  IF p_ubicacion IS NULL THEN RAISE EXCEPTION 'Ubicación requerida'; END IF;
  SELECT * INTO v_origen FROM public.lotes WHERE id=p_lote_origen;
  IF v_origen IS NULL THEN RAISE EXCEPTION 'Lote origen no existe'; END IF;

  SELECT COALESCE(cantidad_cajas,0) INTO v_stock FROM public.stock_lote_ubicacion
    WHERE lote_id=p_lote_origen AND ubicacion_id=p_ubicacion;
  IF v_stock IS NULL OR v_stock < p_cantidad THEN
    RAISE EXCEPTION 'Stock insuficiente en ubicación. Disponible: %', COALESCE(v_stock,0);
  END IF;

  v_prod := COALESCE(p_producto_destino, v_origen.producto_id);
  v_fp := COALESCE(p_fp_destino, v_origen.fecha_produccion);
  v_fv := COALESCE(p_fv_destino, v_origen.fecha_vencimiento);
  v_estado := COALESCE(NULLIF(p_estado_destino,''), v_origen.estado, 'DISPONIBLE');

  IF v_prod = v_origen.producto_id AND v_fp = v_origen.fecha_produccion AND v_fv = v_origen.fecha_vencimiento THEN
    RAISE EXCEPTION 'El lote destino es idéntico al origen. Cambia producto, FP o FV.';
  END IF;

  SELECT id INTO v_dest_id FROM public.lotes
   WHERE producto_id=v_prod AND fecha_produccion=v_fp AND fecha_vencimiento=v_fv;
  IF v_dest_id IS NULL THEN
    SELECT codigo_base INTO v_codigo_base FROM public.productos WHERE id=v_prod;
    IF v_codigo_base IS NULL THEN RAISE EXCEPTION 'Producto destino no existe'; END IF;
    v_codigo_lote := v_codigo_base || ' FP:' || to_char(v_fp,'DD MM YYYY') || ' FV:' || to_char(v_fv,'DD MM YYYY');
    INSERT INTO public.lotes(producto_id, fecha_produccion, fecha_vencimiento, codigo_lote, estado, mercado, costo_por_caja)
    VALUES (v_prod, v_fp, v_fv, v_codigo_lote, v_estado, v_origen.mercado, v_origen.costo_por_caja)
    RETURNING id INTO v_dest_id;
  END IF;

  UPDATE public.stock_lote_ubicacion SET cantidad_cajas=cantidad_cajas-p_cantidad, updated_at=now()
    WHERE lote_id=p_lote_origen AND ubicacion_id=p_ubicacion;
  INSERT INTO public.stock_lote_ubicacion(lote_id, ubicacion_id, cantidad_cajas)
  VALUES (v_dest_id, p_ubicacion, p_cantidad)
  ON CONFLICT (lote_id, ubicacion_id) DO UPDATE
    SET cantidad_cajas=public.stock_lote_ubicacion.cantidad_cajas+p_cantidad, updated_at=now();

  SELECT email INTO v_user_email FROM auth.users WHERE id=auth.uid();

  INSERT INTO public.movimientos(
    tipo, fecha, lote_id, ubicacion_origen_id, cantidad_cajas, latas,
    motivo, observaciones, usuario_id, usuario_nombre, estado_lote
  ) VALUES (
    'CAMBIO', p_fecha, p_lote_origen, p_ubicacion, p_cantidad, p_latas,
    'CAMBIO DE LOTE → ' || (SELECT codigo_lote FROM public.lotes WHERE id=v_dest_id),
    p_observaciones, auth.uid(), v_user_email, v_origen.estado
  ) RETURNING id INTO v_mov_out;

  INSERT INTO public.movimientos(
    tipo, fecha, lote_id, ubicacion_destino_id, cantidad_cajas, latas,
    motivo, observaciones, usuario_id, usuario_nombre, estado_lote
  ) VALUES (
    'CAMBIO', p_fecha, v_dest_id, p_ubicacion, p_cantidad, p_latas,
    'CAMBIO DE LOTE ← ' || v_origen.codigo_lote,
    p_observaciones, auth.uid(), v_user_email, v_estado
  ) RETURNING id INTO v_mov_in;

  RETURN v_dest_id;
END; $function$;
