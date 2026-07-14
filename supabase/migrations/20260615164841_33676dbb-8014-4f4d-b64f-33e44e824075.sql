
-- Función: eliminar movimiento (solo ADMIN). Revierte stock.
CREATE OR REPLACE FUNCTION public.admin_eliminar_movimiento(p_mov uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m RECORD;
BEGIN
  IF NOT public.has_role(auth.uid(), 'ADMIN') THEN
    RAISE EXCEPTION 'Solo ADMIN puede eliminar movimientos';
  END IF;

  SELECT * INTO m FROM public.movimientos WHERE id = p_mov;
  IF m IS NULL THEN RAISE EXCEPTION 'Movimiento no existe'; END IF;

  -- Revertir efecto en stock
  IF m.tipo IN ('SALIDA','MERMA','AJUSTE_NEGATIVO') THEN
    INSERT INTO public.stock_lote_ubicacion(lote_id, ubicacion_id, cantidad_cajas)
      VALUES (m.lote_id, m.ubicacion_origen_id, m.cantidad_cajas)
      ON CONFLICT (lote_id, ubicacion_id)
      DO UPDATE SET cantidad_cajas = stock_lote_ubicacion.cantidad_cajas + m.cantidad_cajas, updated_at = now();
  ELSIF m.tipo IN ('ENTRADA','AJUSTE_POSITIVO') THEN
    UPDATE public.stock_lote_ubicacion
      SET cantidad_cajas = cantidad_cajas - m.cantidad_cajas, updated_at = now()
      WHERE lote_id = m.lote_id AND ubicacion_id = m.ubicacion_destino_id;
  ELSIF m.tipo = 'TRASLADO' THEN
    INSERT INTO public.stock_lote_ubicacion(lote_id, ubicacion_id, cantidad_cajas)
      VALUES (m.lote_id, m.ubicacion_origen_id, m.cantidad_cajas)
      ON CONFLICT (lote_id, ubicacion_id)
      DO UPDATE SET cantidad_cajas = stock_lote_ubicacion.cantidad_cajas + m.cantidad_cajas, updated_at = now();
    UPDATE public.stock_lote_ubicacion
      SET cantidad_cajas = cantidad_cajas - m.cantidad_cajas, updated_at = now()
      WHERE lote_id = m.lote_id AND ubicacion_id = m.ubicacion_destino_id;
  END IF;

  -- Bypass trigger de bloqueo
  PERFORM set_config('session_replication_role','replica',true);
  DELETE FROM public.movimientos WHERE id = p_mov;
  PERFORM set_config('session_replication_role','origin',true);
END $$;

REVOKE EXECUTE ON FUNCTION public.admin_eliminar_movimiento(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_eliminar_movimiento(uuid) TO authenticated, service_role;

-- Función: editar movimiento (solo ADMIN). Solo campos descriptivos.
CREATE OR REPLACE FUNCTION public.admin_editar_movimiento(
  p_mov uuid,
  p_fecha date,
  p_nro_guia text,
  p_nro_vale text,
  p_cliente uuid,
  p_motivo text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
        motivo = p_motivo
    WHERE id = p_mov;
  PERFORM set_config('session_replication_role','origin',true);
END $$;

REVOKE EXECUTE ON FUNCTION public.admin_editar_movimiento(uuid,date,text,text,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_editar_movimiento(uuid,date,text,text,uuid,text) TO authenticated, service_role;
