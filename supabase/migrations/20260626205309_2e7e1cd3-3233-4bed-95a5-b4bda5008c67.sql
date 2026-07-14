
-- 1) Update gen_codigo_lote: use spaces instead of dashes
CREATE OR REPLACE FUNCTION public.gen_codigo_lote()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  cb text;
BEGIN
  SELECT codigo_base INTO cb FROM public.productos WHERE id = NEW.producto_id;
  IF cb IS NULL THEN
    RAISE EXCEPTION 'Producto no existe para generar código de lote';
  END IF;
  NEW.codigo_lote := cb || ' FP:' || to_char(NEW.fecha_produccion,'DD MM YYYY') || ' FV:' || to_char(NEW.fecha_vencimiento,'DD MM YYYY');
  RETURN NEW;
END;
$function$;

-- 2) Update upsert_lote
CREATE OR REPLACE FUNCTION public.upsert_lote(p_producto uuid, p_fp date, p_fv date, p_estado text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_codigo_base text;
  v_codigo_lote text;
BEGIN
  SELECT id INTO v_id FROM public.lotes
   WHERE producto_id = p_producto AND fecha_produccion = p_fp AND fecha_vencimiento = p_fv;

  IF v_id IS NULL THEN
    SELECT codigo_base INTO v_codigo_base FROM public.productos WHERE id = p_producto;
    IF v_codigo_base IS NULL THEN RAISE EXCEPTION 'Producto no existe'; END IF;
    v_codigo_lote := v_codigo_base || ' FP:' || to_char(p_fp,'DD MM YYYY') || ' FV:' || to_char(p_fv,'DD MM YYYY');

    INSERT INTO public.lotes(producto_id, fecha_produccion, fecha_vencimiento, codigo_lote, estado)
    VALUES (p_producto, p_fp, p_fv, v_codigo_lote, COALESCE(NULLIF(p_estado,''),'DISPONIBLE'))
    RETURNING id INTO v_id;
  ELSIF p_estado IS NOT NULL AND p_estado <> '' THEN
    UPDATE public.lotes SET estado = p_estado WHERE id = v_id;
  END IF;

  RETURN v_id;
END;
$function$;

-- 3) Update cambiar_lote (only codigo_lote line)
CREATE OR REPLACE FUNCTION public.cambiar_lote(p_lote_origen uuid, p_cantidad numeric, p_ubicacion uuid, p_latas integer DEFAULT NULL::integer, p_producto_destino uuid DEFAULT NULL::uuid, p_fp_destino date DEFAULT NULL::date, p_fv_destino date DEFAULT NULL::date, p_estado_destino text DEFAULT NULL::text, p_observaciones text DEFAULT NULL::text, p_fecha date DEFAULT CURRENT_DATE)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
    motivo, observaciones, usuario_id, usuario_nombre, estado_lote, mercado
  ) VALUES (
    'CAMBIO', p_fecha, p_lote_origen, p_ubicacion, p_cantidad, p_latas,
    'CAMBIO DE LOTE → ' || (SELECT codigo_lote FROM public.lotes WHERE id=v_dest_id),
    p_observaciones, auth.uid(), v_user_email, v_origen.estado, v_origen.mercado
  ) RETURNING id INTO v_mov_out;

  INSERT INTO public.movimientos(
    tipo, fecha, lote_id, ubicacion_destino_id, cantidad_cajas, latas,
    motivo, observaciones, usuario_id, usuario_nombre, estado_lote, mercado
  ) VALUES (
    'CAMBIO', p_fecha, v_dest_id, p_ubicacion, p_cantidad, p_latas,
    'CAMBIO DE LOTE ← ' || v_origen.codigo_lote,
    p_observaciones, auth.uid(), v_user_email, v_estado, v_origen.mercado
  ) RETURNING id INTO v_mov_in;

  RETURN v_dest_id;
END;
$function$;

-- 4) Rewrite existing lote codes: replace DD-MM-YYYY occurrences with DD MM YYYY
UPDATE public.lotes
   SET codigo_lote = regexp_replace(codigo_lote, '([0-9]{2})-([0-9]{2})-([0-9]{4})', '\1 \2 \3', 'g')
 WHERE codigo_lote ~ '[0-9]{2}-[0-9]{2}-[0-9]{4}';
