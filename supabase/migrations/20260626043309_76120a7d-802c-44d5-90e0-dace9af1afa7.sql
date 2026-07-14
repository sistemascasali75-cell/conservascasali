ALTER TABLE public.movimientos
  ALTER COLUMN cantidad_cajas DROP NOT NULL;

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
  boolean,
  text
);

CREATE OR REPLACE FUNCTION public.registrar_movimiento(
  p_tipo public.tipo_mov_t,
  p_lote_id uuid,
  p_cantidad numeric DEFAULT 0,
  p_ubic_origen uuid DEFAULT NULL::uuid,
  p_ubic_destino uuid DEFAULT NULL::uuid,
  p_cliente_proveedor uuid DEFAULT NULL::uuid,
  p_nro_guia text DEFAULT NULL::text,
  p_nro_vale text DEFAULT NULL::text,
  p_motivo text DEFAULT NULL::text,
  p_fecha date DEFAULT ((now() AT TIME ZONE 'America/Lima'::text))::date,
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
SET timezone TO 'America/Lima'
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
  v_mercado public.mercado_t;
BEGIN
  IF p_cantidad IS NULL OR p_cantidad < 0 THEN
    RAISE EXCEPTION 'La cantidad de cajas no puede ser negativa';
  END IF;

  IF p_latas IS NOT NULL AND p_latas < 0 THEN
    RAISE EXCEPTION 'Latas debe ser mayor o igual a 0';
  END IF;

  IF p_tipo IN ('SALIDA','MERMA','AJUSTE_NEGATIVO','TRASLADO','CAMBIO') AND p_ubic_origen IS NULL THEN
    RAISE EXCEPTION 'Ubicación origen requerida';
  END IF;

  IF p_tipo IN ('ENTRADA','AJUSTE_POSITIVO','TRASLADO') AND p_ubic_destino IS NULL THEN
    RAISE EXCEPTION 'Ubicación destino requerida';
  END IF;

  SELECT * INTO v_lote FROM public.lotes WHERE id = p_lote_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote no encontrado';
  END IF;

  v_certificacion := NULLIF(trim(both ' ' FROM concat_ws(' · ', v_lote.certificadora, to_char(v_lote.fecha_certificacion, 'DD-MM-YYYY'))), '');
  v_tiene_warrant := (p_nro_warrant IS NOT NULL AND length(trim(p_nro_warrant)) > 0);
  v_tiene_etiqueta := COALESCE(p_tiene_etiqueta, false);
  v_etiqueta := CASE WHEN v_tiene_etiqueta THEN COALESCE(NULLIF(v_lote.etiqueta, ''), 'CON ETIQUETA') ELSE NULL END;
  v_mercado := v_lote.mercado;

  SELECT COALESCE(email, '') INTO v_user_email FROM auth.users WHERE id = auth.uid();

  IF p_tipo IN ('SALIDA','TRASLADO','CAMBIO','MERMA','AJUSTE_NEGATIVO') AND p_cantidad > 0 THEN
    SELECT COALESCE(SUM(cantidad_cajas), 0)
      INTO v_stock
      FROM public.stock_lote_ubicacion
      WHERE lote_id = p_lote_id AND ubicacion_id = p_ubic_origen;

    IF COALESCE(v_stock, 0) < p_cantidad THEN
      RAISE EXCEPTION 'Stock insuficiente en ubicación origen (% disponibles)', COALESCE(v_stock, 0);
    END IF;

    SELECT COALESCE(SUM(cantidad_cajas), 0)
      INTO v_total_lote
      FROM public.stock_lote_ubicacion
      WHERE lote_id = p_lote_id;

    SELECT COALESCE(SUM(cantidad_cajas_warrant), 0)
      INTO v_warrant
      FROM public.warrants
      WHERE lote_id = p_lote_id AND estado = 'ACTIVO';

    IF (COALESCE(v_total_lote, 0) - p_cantidad) < COALESCE(v_warrant, 0) THEN
      RAISE EXCEPTION 'No se puede mover: lote tiene % cajas en warrant activo', COALESCE(v_warrant, 0);
    END IF;
  END IF;

  INSERT INTO public.movimientos (
    tipo,
    fecha,
    lote_id,
    ubicacion_origen_id,
    ubicacion_destino_id,
    cantidad_cajas,
    latas,
    piso,
    cliente_proveedor_id,
    mercado_id,
    nro_guia,
    nro_vale,
    nro_warrant,
    tiene_warrant,
    motivo,
    observaciones,
    usuario_id,
    usuario_nombre,
    tiene_etiqueta,
    etiqueta,
    certificacion,
    estado_lote,
    mercado,
    tercero
  ) VALUES (
    p_tipo,
    COALESCE(p_fecha, ((now() AT TIME ZONE 'America/Lima')::date)),
    p_lote_id,
    p_ubic_origen,
    p_ubic_destino,
    p_cantidad,
    COALESCE(p_latas, 0),
    p_piso,
    p_cliente_proveedor,
    p_mercado_id,
    NULLIF(trim(COALESCE(p_nro_guia, '')), ''),
    NULLIF(trim(COALESCE(p_nro_vale, '')), ''),
    NULLIF(trim(COALESCE(p_nro_warrant, '')), ''),
    v_tiene_warrant,
    NULLIF(trim(COALESCE(p_motivo, '')), ''),
    NULLIF(trim(COALESCE(p_observaciones, '')), ''),
    auth.uid(),
    v_user_email,
    v_tiene_etiqueta,
    v_etiqueta,
    v_certificacion,
    v_lote.estado,
    v_mercado,
    NULLIF(trim(COALESCE(p_tercero, '')), '')
  ) RETURNING id INTO v_mov_id;

  IF p_tipo IN ('SALIDA','MERMA','AJUSTE_NEGATIVO') AND p_cantidad > 0 THEN
    UPDATE public.stock_lote_ubicacion
      SET cantidad_cajas = cantidad_cajas - p_cantidad,
          updated_at = now()
      WHERE lote_id = p_lote_id AND ubicacion_id = p_ubic_origen;
  ELSIF p_tipo IN ('ENTRADA','AJUSTE_POSITIVO') AND p_cantidad > 0 THEN
    INSERT INTO public.stock_lote_ubicacion (lote_id, ubicacion_id, cantidad_cajas)
    VALUES (p_lote_id, p_ubic_destino, p_cantidad)
    ON CONFLICT (lote_id, ubicacion_id) DO UPDATE
      SET cantidad_cajas = public.stock_lote_ubicacion.cantidad_cajas + EXCLUDED.cantidad_cajas,
          updated_at = now();
  ELSIF p_tipo IN ('TRASLADO','CAMBIO') AND p_cantidad > 0 THEN
    UPDATE public.stock_lote_ubicacion
      SET cantidad_cajas = cantidad_cajas - p_cantidad,
          updated_at = now()
      WHERE lote_id = p_lote_id AND ubicacion_id = p_ubic_origen;

    IF p_ubic_destino IS NOT NULL THEN
      INSERT INTO public.stock_lote_ubicacion (lote_id, ubicacion_id, cantidad_cajas)
      VALUES (p_lote_id, p_ubic_destino, p_cantidad)
      ON CONFLICT (lote_id, ubicacion_id) DO UPDATE
        SET cantidad_cajas = public.stock_lote_ubicacion.cantidad_cajas + EXCLUDED.cantidad_cajas,
            updated_at = now();
    END IF;
  END IF;

  DELETE FROM public.stock_lote_ubicacion WHERE cantidad_cajas <= 0;

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

REVOKE EXECUTE ON FUNCTION public.registrar_movimiento(
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
) FROM anon;

REVOKE EXECUTE ON FUNCTION public.registrar_movimiento(
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
) FROM PUBLIC;