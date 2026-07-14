
-- 1) New columns on movimientos (snapshot fields)
ALTER TABLE public.movimientos
  ADD COLUMN IF NOT EXISTS nro_warrant text,
  ADD COLUMN IF NOT EXISTS tiene_warrant boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mercado mercado_t,
  ADD COLUMN IF NOT EXISTS observaciones text,
  ADD COLUMN IF NOT EXISTS certificacion text,
  ADD COLUMN IF NOT EXISTS etiqueta text,
  ADD COLUMN IF NOT EXISTS tiene_etiqueta boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS estado_lote estado_lote_t;

-- 2) Replace registrar_movimiento with snapshot capture + new params
CREATE OR REPLACE FUNCTION public.registrar_movimiento(
  p_tipo tipo_mov_t,
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
  p_nro_warrant text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_stock NUMERIC;
  v_warrant NUMERIC;
  v_total_lote NUMERIC;
  v_mov_id UUID;
  v_lote RECORD;
  v_certificacion TEXT;
  v_tiene_warrant BOOLEAN;
  v_tiene_etiqueta BOOLEAN;
BEGIN
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN RAISE EXCEPTION 'La cantidad debe ser mayor a 0'; END IF;

  SELECT * INTO v_lote FROM lotes WHERE id = p_lote_id;
  IF v_lote IS NULL THEN RAISE EXCEPTION 'Lote no existe'; END IF;

  -- Validación de certificación: SALIDA a cliente requiere CERTIFICADO
  IF p_tipo = 'SALIDA' THEN
    IF v_lote.estado <> 'CERTIFICADO' THEN
      RAISE EXCEPTION 'No se permite la salida: el lote no está CERTIFICADO (estado actual: %)', v_lote.estado;
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

  -- Snapshot fields from lote
  v_certificacion := NULLIF(
    trim(both ' ' FROM concat_ws(' · ', v_lote.certificadora, to_char(v_lote.fecha_certificacion, 'DD-MM-YYYY'))),
    ''
  );
  v_tiene_etiqueta := v_lote.etiqueta IS NOT NULL AND v_lote.etiqueta <> 'S/E';

  IF p_nro_warrant IS NOT NULL AND length(trim(p_nro_warrant)) > 0 THEN
    v_tiene_warrant := true;
  ELSE
    SELECT EXISTS (SELECT 1 FROM warrants WHERE lote_id = p_lote_id AND estado = 'ACTIVO')
      INTO v_tiene_warrant;
  END IF;

  INSERT INTO movimientos(
    tipo, fecha, lote_id, ubicacion_origen_id, ubicacion_destino_id,
    cantidad_cajas, nro_guia, nro_vale, cliente_proveedor_id, motivo, usuario_id,
    nro_warrant, tiene_warrant, mercado, observaciones, certificacion,
    etiqueta, tiene_etiqueta, estado_lote
  )
  VALUES (
    p_tipo, p_fecha, p_lote_id, p_ubic_origen, p_ubic_destino,
    p_cantidad, p_nro_guia, p_nro_vale, p_cliente_proveedor, p_motivo, auth.uid(),
    NULLIF(trim(p_nro_warrant), ''), v_tiene_warrant, v_lote.mercado,
    NULLIF(trim(p_observaciones), ''), v_certificacion,
    v_lote.etiqueta, v_tiene_etiqueta, v_lote.estado
  )
  RETURNING id INTO v_mov_id;

  RETURN v_mov_id;
END $function$;

-- 3) Expand admin_editar_movimiento with new fields
CREATE OR REPLACE FUNCTION public.admin_editar_movimiento(
  p_mov uuid,
  p_fecha date,
  p_nro_guia text,
  p_nro_vale text,
  p_cliente uuid,
  p_motivo text,
  p_observaciones text DEFAULT NULL,
  p_nro_warrant text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'ADMIN') THEN
    RAISE EXCEPTION 'Solo ADMIN puede editar movimientos';
  END IF;
  PERFORM set_config('session_replication_role','replica',true);
  UPDATE public.movimientos
    SET fecha = COALESCE(p_fecha, fecha),
        nro_guia = p_nro_guia,
        nro_vale = p_nro_vale,
        cliente_proveedor_id = p_cliente,
        motivo = p_motivo,
        observaciones = NULLIF(trim(p_observaciones), ''),
        nro_warrant = NULLIF(trim(p_nro_warrant), ''),
        tiene_warrant = CASE
          WHEN p_nro_warrant IS NOT NULL AND length(trim(p_nro_warrant)) > 0 THEN true
          ELSE tiene_warrant
        END
    WHERE id = p_mov;
  PERFORM set_config('session_replication_role','origin',true);
END $function$;
