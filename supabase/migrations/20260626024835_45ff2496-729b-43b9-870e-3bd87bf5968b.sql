DROP FUNCTION IF EXISTS public.registrar_movimiento(
  public.tipo_mov_t,
  uuid,
  numeric,
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  date,
  text,
  text,
  integer,
  integer,
  uuid,
  boolean
);

CREATE OR REPLACE FUNCTION public.registrar_movimiento(
  p_tipo public.tipo_mov_t,
  p_lote_id uuid,
  p_cantidad numeric,
  p_ubic_origen uuid DEFAULT NULL::uuid,
  p_ubic_destino uuid DEFAULT NULL::uuid,
  p_cliente_proveedor uuid DEFAULT NULL::uuid,
  p_nro_guia text DEFAULT NULL::text,
  p_nro_vale text DEFAULT NULL::text,
  p_motivo text DEFAULT NULL::text,
  p_fecha date DEFAULT CURRENT_DATE,
  p_observaciones text DEFAULT NULL::text,
  p_nro_warrant text DEFAULT NULL::text,
  p_latas integer DEFAULT NULL::integer,
  p_piso integer DEFAULT NULL::integer,
  p_mercado_id uuid DEFAULT NULL::uuid,
  p_tiene_etiqueta boolean DEFAULT NULL::boolean,
  p_tercero text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_stock numeric;
  v_warrant numeric;
  v_total_lote numeric;
  v_mov_id uuid;
  v_lote record;
  v_certificacion text;
  v_tiene_warrant boolean;
  v_tiene_etiqueta boolean;
  v_etiqueta text;
  v_user_email text;
BEGIN
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN
    RAISE EXCEPTION 'La cantidad debe ser mayor a 0';
  END IF;

  SELECT * INTO v_lote FROM public.lotes WHERE id = p_lote_id;
  IF v_lote IS NULL THEN
    RAISE EXCEPTION 'Lote no existe';
  END IF;

  IF p_tipo IN ('SALIDA','MERMA','AJUSTE_NEGATIVO') THEN
    IF p_ubic_origen IS NULL THEN
      RAISE EXCEPTION 'Ubicación de origen requerida';
    END IF;

    SELECT COALESCE(cantidad_cajas, 0) INTO v_stock
    FROM public.stock_lote_ubicacion
    WHERE lote_id = p_lote_id AND ubicacion_id = p_ubic_origen;

    v_stock := COALESCE(v_stock, 0);

    IF v_stock < p_cantidad THEN
      RAISE EXCEPTION 'Stock insuficiente. Disponible: %, solicitado: %', v_stock, p_cantidad;
    END IF;

    SELECT COALESCE(SUM(cantidad_cajas_warrant), 0) INTO v_warrant
    FROM public.warrants
    WHERE lote_id = p_lote_id AND estado = 'ACTIVO';

    SELECT COALESCE(SUM(cantidad_cajas), 0) INTO v_total_lote
    FROM public.stock_lote_ubicacion
    WHERE lote_id = p_lote_id;

    IF (v_total_lote - p_cantidad) < v_warrant THEN
      RAISE EXCEPTION 'Bloqueado por warrant. Total: %, comprometido: %', v_total_lote, v_warrant;
    END IF;

    UPDATE public.stock_lote_ubicacion
    SET cantidad_cajas = cantidad_cajas - p_cantidad,
        updated_at = now()
    WHERE lote_id = p_lote_id AND ubicacion_id = p_ubic_origen;

  ELSIF p_tipo IN ('ENTRADA','AJUSTE_POSITIVO') THEN
    IF p_ubic_destino IS NULL THEN
      RAISE EXCEPTION 'Ubicación de destino requerida';
    END IF;

    INSERT INTO public.stock_lote_ubicacion(lote_id, ubicacion_id, cantidad_cajas)
    VALUES (p_lote_id, p_ubic_destino, p_cantidad)
    ON CONFLICT (lote_id, ubicacion_id)
    DO UPDATE SET cantidad_cajas = public.stock_lote_ubicacion.cantidad_cajas + p_cantidad,
                  updated_at = now();

  ELSIF p_tipo = 'TRASLADO' THEN
    IF p_ubic_origen IS NULL OR p_ubic_destino IS NULL THEN
      RAISE EXCEPTION 'Traslado requiere origen y destino';
    END IF;

    SELECT COALESCE(cantidad_cajas, 0) INTO v_stock
    FROM public.stock_lote_ubicacion
    WHERE lote_id = p_lote_id AND ubicacion_id = p_ubic_origen;

    v_stock := COALESCE(v_stock, 0);

    IF v_stock < p_cantidad THEN
      RAISE EXCEPTION 'Stock insuficiente en origen: %', v_stock;
    END IF;

    UPDATE public.stock_lote_ubicacion
    SET cantidad_cajas = cantidad_cajas - p_cantidad,
        updated_at = now()
    WHERE lote_id = p_lote_id AND ubicacion_id = p_ubic_origen;

    INSERT INTO public.stock_lote_ubicacion(lote_id, ubicacion_id, cantidad_cajas)
    VALUES (p_lote_id, p_ubic_destino, p_cantidad)
    ON CONFLICT (lote_id, ubicacion_id)
    DO UPDATE SET cantidad_cajas = public.stock_lote_ubicacion.cantidad_cajas + p_cantidad,
                  updated_at = now();
  END IF;

  v_certificacion := NULLIF(trim(both ' ' FROM concat_ws(' · ', v_lote.certificadora, to_char(v_lote.fecha_certificacion, 'DD-MM-YYYY'))), '');
  v_tiene_etiqueta := COALESCE(p_tiene_etiqueta, v_lote.etiqueta IS NOT NULL AND v_lote.etiqueta <> 'S/E');
  v_etiqueta := CASE WHEN v_tiene_etiqueta THEN COALESCE(NULLIF(v_lote.etiqueta, ''), 'SI') ELSE NULL END;

  IF p_nro_warrant IS NOT NULL AND length(trim(p_nro_warrant)) > 0 THEN
    v_tiene_warrant := true;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.warrants WHERE lote_id = p_lote_id AND estado = 'ACTIVO'
    ) INTO v_tiene_warrant;
  END IF;

  SELECT email INTO v_user_email FROM auth.users WHERE id = auth.uid();

  INSERT INTO public.movimientos(
    tipo, fecha, lote_id, ubicacion_origen_id, ubicacion_destino_id,
    cantidad_cajas, nro_guia, nro_vale, cliente_proveedor_id, motivo,
    usuario_id, usuario_nombre, nro_warrant, tiene_warrant, mercado,
    observaciones, certificacion, etiqueta, tiene_etiqueta, estado_lote,
    latas, piso, mercado_id, tercero
  ) VALUES (
    p_tipo, p_fecha, p_lote_id, p_ubic_origen, p_ubic_destino,
    p_cantidad, NULLIF(trim(COALESCE(p_nro_guia, '')), ''), NULLIF(trim(COALESCE(p_nro_vale, '')), ''),
    p_cliente_proveedor, NULLIF(trim(COALESCE(p_motivo, '')), ''),
    auth.uid(), v_user_email, NULLIF(trim(COALESCE(p_nro_warrant, '')), ''),
    v_tiene_warrant, v_lote.mercado, NULLIF(trim(COALESCE(p_observaciones, '')), ''),
    v_certificacion, v_etiqueta, v_tiene_etiqueta, v_lote.estado,
    p_latas, p_piso, p_mercado_id, NULLIF(trim(COALESCE(p_tercero, '')), '')
  ) RETURNING id INTO v_mov_id;

  RETURN v_mov_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_movimiento(
  public.tipo_mov_t,
  uuid,
  numeric,
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  date,
  text,
  text,
  integer,
  integer,
  uuid,
  boolean,
  text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_movimiento(
  public.tipo_mov_t,
  uuid,
  numeric,
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  date,
  text,
  text,
  integer,
  integer,
  uuid,
  boolean,
  text
) TO service_role;