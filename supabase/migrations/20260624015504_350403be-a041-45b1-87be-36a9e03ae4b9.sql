CREATE OR REPLACE FUNCTION public.block_mov_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF COALESCE(current_setting('app.bypass_movimientos_block', true), 'false') = 'true' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Movimientos no pueden modificarse ni eliminarse';
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_editar_movimiento(
  p_mov uuid,
  p_tipo tipo_mov_t,
  p_fecha date,
  p_lote_id uuid,
  p_ubic_origen uuid,
  p_ubic_destino uuid,
  p_cantidad_cajas numeric,
  p_latas integer,
  p_piso integer,
  p_nro_guia text,
  p_nro_vale text,
  p_cliente uuid,
  p_motivo text,
  p_observaciones text,
  p_nro_warrant text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  m RECORD;
  v_lote RECORD;
  v_certificacion text;
  v_tiene_etiqueta boolean;
  v_tiene_warrant boolean;
  v_tipo tipo_mov_t;
  v_fecha date;
  v_lote_id uuid;
  v_cantidad numeric;
BEGIN
  IF NOT public.has_role(auth.uid(), 'ADMIN') THEN
    RAISE EXCEPTION 'Solo ADMIN puede editar movimientos';
  END IF;

  SELECT * INTO m FROM public.movimientos WHERE id = p_mov;
  IF m IS NULL THEN
    RAISE EXCEPTION 'Movimiento no existe';
  END IF;

  v_tipo := COALESCE(p_tipo, m.tipo);
  v_fecha := COALESCE(p_fecha, m.fecha);
  v_lote_id := COALESCE(p_lote_id, m.lote_id);
  v_cantidad := COALESCE(p_cantidad_cajas, m.cantidad_cajas);

  IF v_cantidad IS NULL OR v_cantidad <= 0 THEN
    RAISE EXCEPTION 'La cantidad debe ser mayor a 0';
  END IF;

  IF v_tipo IN ('SALIDA','MERMA','AJUSTE_NEGATIVO') AND p_ubic_origen IS NULL THEN
    RAISE EXCEPTION 'Ubicación de origen requerida';
  END IF;
  IF v_tipo IN ('ENTRADA','AJUSTE_POSITIVO') AND p_ubic_destino IS NULL THEN
    RAISE EXCEPTION 'Ubicación de destino requerida';
  END IF;
  IF v_tipo = 'TRASLADO' AND (p_ubic_origen IS NULL OR p_ubic_destino IS NULL) THEN
    RAISE EXCEPTION 'Traslado requiere origen y destino';
  END IF;

  SELECT * INTO v_lote FROM public.lotes WHERE id = v_lote_id;
  IF v_lote IS NULL THEN
    RAISE EXCEPTION 'Lote no existe';
  END IF;

  IF m.tipo IN ('SALIDA','MERMA','AJUSTE_NEGATIVO') THEN
    INSERT INTO public.stock_lote_ubicacion(lote_id, ubicacion_id, cantidad_cajas)
      VALUES (m.lote_id, m.ubicacion_origen_id, m.cantidad_cajas)
      ON CONFLICT (lote_id, ubicacion_id)
      DO UPDATE SET cantidad_cajas = public.stock_lote_ubicacion.cantidad_cajas + EXCLUDED.cantidad_cajas,
                    updated_at = now();
  ELSIF m.tipo IN ('ENTRADA','AJUSTE_POSITIVO') THEN
    UPDATE public.stock_lote_ubicacion
      SET cantidad_cajas = GREATEST(cantidad_cajas - m.cantidad_cajas, 0), updated_at = now()
      WHERE lote_id = m.lote_id AND ubicacion_id = m.ubicacion_destino_id;
  ELSIF m.tipo = 'TRASLADO' THEN
    INSERT INTO public.stock_lote_ubicacion(lote_id, ubicacion_id, cantidad_cajas)
      VALUES (m.lote_id, m.ubicacion_origen_id, m.cantidad_cajas)
      ON CONFLICT (lote_id, ubicacion_id)
      DO UPDATE SET cantidad_cajas = public.stock_lote_ubicacion.cantidad_cajas + EXCLUDED.cantidad_cajas,
                    updated_at = now();
    UPDATE public.stock_lote_ubicacion
      SET cantidad_cajas = GREATEST(cantidad_cajas - m.cantidad_cajas, 0), updated_at = now()
      WHERE lote_id = m.lote_id AND ubicacion_id = m.ubicacion_destino_id;
  END IF;

  IF v_tipo IN ('ENTRADA','AJUSTE_POSITIVO') THEN
    INSERT INTO public.stock_lote_ubicacion(lote_id, ubicacion_id, cantidad_cajas)
      VALUES (v_lote_id, p_ubic_destino, v_cantidad)
      ON CONFLICT (lote_id, ubicacion_id)
      DO UPDATE SET cantidad_cajas = public.stock_lote_ubicacion.cantidad_cajas + EXCLUDED.cantidad_cajas,
                    updated_at = now();
  ELSIF v_tipo IN ('SALIDA','MERMA','AJUSTE_NEGATIVO') THEN
    INSERT INTO public.stock_lote_ubicacion(lote_id, ubicacion_id, cantidad_cajas)
      VALUES (v_lote_id, p_ubic_origen, 0)
      ON CONFLICT (lote_id, ubicacion_id) DO NOTHING;
    UPDATE public.stock_lote_ubicacion
      SET cantidad_cajas = GREATEST(cantidad_cajas - v_cantidad, 0), updated_at = now()
      WHERE lote_id = v_lote_id AND ubicacion_id = p_ubic_origen;
  ELSIF v_tipo = 'TRASLADO' THEN
    INSERT INTO public.stock_lote_ubicacion(lote_id, ubicacion_id, cantidad_cajas)
      VALUES (v_lote_id, p_ubic_origen, 0)
      ON CONFLICT (lote_id, ubicacion_id) DO NOTHING;
    UPDATE public.stock_lote_ubicacion
      SET cantidad_cajas = GREATEST(cantidad_cajas - v_cantidad, 0), updated_at = now()
      WHERE lote_id = v_lote_id AND ubicacion_id = p_ubic_origen;
    INSERT INTO public.stock_lote_ubicacion(lote_id, ubicacion_id, cantidad_cajas)
      VALUES (v_lote_id, p_ubic_destino, v_cantidad)
      ON CONFLICT (lote_id, ubicacion_id)
      DO UPDATE SET cantidad_cajas = public.stock_lote_ubicacion.cantidad_cajas + EXCLUDED.cantidad_cajas,
                    updated_at = now();
  END IF;

  v_certificacion := NULLIF(trim(both ' ' FROM concat_ws(' · ', v_lote.certificadora, to_char(v_lote.fecha_certificacion,'DD-MM-YYYY'))),'');
  v_tiene_etiqueta := v_lote.etiqueta IS NOT NULL AND v_lote.etiqueta <> 'S/E';
  v_tiene_warrant := p_nro_warrant IS NOT NULL AND length(trim(p_nro_warrant)) > 0;

  PERFORM set_config('app.bypass_movimientos_block', 'true', true);

  UPDATE public.movimientos
    SET tipo = v_tipo,
        fecha = v_fecha,
        lote_id = v_lote_id,
        ubicacion_origen_id = p_ubic_origen,
        ubicacion_destino_id = p_ubic_destino,
        cantidad_cajas = v_cantidad,
        latas = p_latas,
        piso = p_piso,
        nro_guia = NULLIF(trim(COALESCE(p_nro_guia,'')), ''),
        nro_vale = NULLIF(trim(COALESCE(p_nro_vale,'')), ''),
        cliente_proveedor_id = p_cliente,
        motivo = NULLIF(trim(COALESCE(p_motivo,'')), ''),
        observaciones = NULLIF(trim(COALESCE(p_observaciones,'')), ''),
        nro_warrant = NULLIF(trim(COALESCE(p_nro_warrant,'')), ''),
        tiene_warrant = v_tiene_warrant,
        mercado = v_lote.mercado,
        certificacion = v_certificacion,
        etiqueta = v_lote.etiqueta,
        tiene_etiqueta = v_tiene_etiqueta,
        estado_lote = v_lote.estado
    WHERE id = p_mov;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_eliminar_movimiento(p_mov uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  m RECORD;
BEGIN
  IF NOT public.has_role(auth.uid(), 'ADMIN') THEN
    RAISE EXCEPTION 'Solo ADMIN puede eliminar movimientos';
  END IF;

  SELECT * INTO m FROM public.movimientos WHERE id = p_mov;
  IF m IS NULL THEN
    RAISE EXCEPTION 'Movimiento no existe';
  END IF;

  IF m.tipo IN ('SALIDA','MERMA','AJUSTE_NEGATIVO') THEN
    INSERT INTO public.stock_lote_ubicacion(lote_id, ubicacion_id, cantidad_cajas)
      VALUES (m.lote_id, m.ubicacion_origen_id, m.cantidad_cajas)
      ON CONFLICT (lote_id, ubicacion_id)
      DO UPDATE SET cantidad_cajas = public.stock_lote_ubicacion.cantidad_cajas + EXCLUDED.cantidad_cajas,
                    updated_at = now();
  ELSIF m.tipo IN ('ENTRADA','AJUSTE_POSITIVO') THEN
    UPDATE public.stock_lote_ubicacion
      SET cantidad_cajas = GREATEST(cantidad_cajas - m.cantidad_cajas, 0), updated_at = now()
      WHERE lote_id = m.lote_id AND ubicacion_id = m.ubicacion_destino_id;
  ELSIF m.tipo = 'TRASLADO' THEN
    INSERT INTO public.stock_lote_ubicacion(lote_id, ubicacion_id, cantidad_cajas)
      VALUES (m.lote_id, m.ubicacion_origen_id, m.cantidad_cajas)
      ON CONFLICT (lote_id, ubicacion_id)
      DO UPDATE SET cantidad_cajas = public.stock_lote_ubicacion.cantidad_cajas + EXCLUDED.cantidad_cajas,
                    updated_at = now();
    UPDATE public.stock_lote_ubicacion
      SET cantidad_cajas = GREATEST(cantidad_cajas - m.cantidad_cajas, 0), updated_at = now()
      WHERE lote_id = m.lote_id AND ubicacion_id = m.ubicacion_destino_id;
  END IF;

  PERFORM set_config('app.bypass_movimientos_block', 'true', true);
  DELETE FROM public.movimientos WHERE id = p_mov;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_editar_movimiento(uuid, tipo_mov_t, date, uuid, uuid, uuid, numeric, integer, integer, text, text, uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_editar_movimiento(uuid, tipo_mov_t, date, uuid, uuid, uuid, numeric, integer, integer, text, text, uuid, text, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_eliminar_movimiento(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_eliminar_movimiento(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';