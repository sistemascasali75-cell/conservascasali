
-- Drop duplicate overloaded functions that cause PostgREST ambiguity
DROP FUNCTION IF EXISTS public.registrar_movimiento(tipo_mov_t, uuid, numeric, uuid, uuid, uuid, text, text, text, date, text, text, integer);
DROP FUNCTION IF EXISTS public.admin_editar_movimiento(uuid, date, text, text, uuid, text);
DROP FUNCTION IF EXISTS public.admin_editar_movimiento(uuid, date, text, text, uuid, text, text, text);

-- Recreate admin_editar_movimiento with full field support + stock reconciliation for cantidad changes
CREATE OR REPLACE FUNCTION public.admin_editar_movimiento(
  p_mov uuid,
  p_fecha date,
  p_nro_guia text,
  p_nro_vale text,
  p_cliente uuid,
  p_motivo text,
  p_observaciones text DEFAULT NULL,
  p_nro_warrant text DEFAULT NULL,
  p_cantidad_cajas numeric DEFAULT NULL,
  p_latas integer DEFAULT NULL,
  p_piso integer DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  m RECORD;
  v_delta numeric;
BEGIN
  IF NOT public.has_role(auth.uid(), 'ADMIN') THEN
    RAISE EXCEPTION 'Solo ADMIN puede editar movimientos';
  END IF;

  SELECT * INTO m FROM public.movimientos WHERE id = p_mov;
  IF m IS NULL THEN RAISE EXCEPTION 'Movimiento no existe'; END IF;

  -- Reconcile stock if cantidad_cajas changed
  IF p_cantidad_cajas IS NOT NULL AND p_cantidad_cajas <> m.cantidad_cajas THEN
    v_delta := p_cantidad_cajas - m.cantidad_cajas;  -- positive => need more impact

    IF m.tipo IN ('ENTRADA','AJUSTE_POSITIVO') THEN
      -- Destino: agregar delta
      INSERT INTO public.stock_lote_ubicacion(lote_id, ubicacion_id, cantidad_cajas)
        VALUES (m.lote_id, m.ubicacion_destino_id, v_delta)
        ON CONFLICT (lote_id, ubicacion_id)
        DO UPDATE SET cantidad_cajas = stock_lote_ubicacion.cantidad_cajas + v_delta, updated_at = now();
    ELSIF m.tipo IN ('SALIDA','MERMA','AJUSTE_NEGATIVO') THEN
      -- Origen: restar delta extra
      UPDATE public.stock_lote_ubicacion
        SET cantidad_cajas = cantidad_cajas - v_delta, updated_at = now()
        WHERE lote_id = m.lote_id AND ubicacion_id = m.ubicacion_origen_id;
    ELSIF m.tipo = 'TRASLADO' THEN
      UPDATE public.stock_lote_ubicacion
        SET cantidad_cajas = cantidad_cajas - v_delta, updated_at = now()
        WHERE lote_id = m.lote_id AND ubicacion_id = m.ubicacion_origen_id;
      INSERT INTO public.stock_lote_ubicacion(lote_id, ubicacion_id, cantidad_cajas)
        VALUES (m.lote_id, m.ubicacion_destino_id, v_delta)
        ON CONFLICT (lote_id, ubicacion_id)
        DO UPDATE SET cantidad_cajas = stock_lote_ubicacion.cantidad_cajas + v_delta, updated_at = now();
    END IF;
  END IF;

  PERFORM set_config('session_replication_role','replica',true);
  UPDATE public.movimientos
    SET fecha = COALESCE(p_fecha, fecha),
        nro_guia = p_nro_guia,
        nro_vale = p_nro_vale,
        cliente_proveedor_id = p_cliente,
        motivo = p_motivo,
        observaciones = NULLIF(trim(COALESCE(p_observaciones,'')), ''),
        nro_warrant = NULLIF(trim(COALESCE(p_nro_warrant,'')), ''),
        tiene_warrant = CASE
          WHEN p_nro_warrant IS NOT NULL AND length(trim(p_nro_warrant)) > 0 THEN true
          ELSE tiene_warrant
        END,
        cantidad_cajas = COALESCE(p_cantidad_cajas, cantidad_cajas),
        latas = COALESCE(p_latas, latas),
        piso = COALESCE(p_piso, piso)
    WHERE id = p_mov;
  PERFORM set_config('session_replication_role','origin',true);
END $function$;
