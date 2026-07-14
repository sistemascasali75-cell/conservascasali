CREATE OR REPLACE FUNCTION public.ventas_emitir_guia(p_guia uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE g record; it record; v_mov uuid; v_ov_id uuid;
BEGIN
  SELECT * INTO g FROM public.ventas_guias WHERE id = p_guia FOR UPDATE;
  IF g IS NULL THEN RAISE EXCEPTION 'Guía no existe'; END IF;
  IF g.estado <> 'BORRADOR' THEN RAISE EXCEPTION 'Solo se puede emitir una guía en BORRADOR'; END IF;

  FOR it IN SELECT * FROM public.ventas_guia_items WHERE guia_id = p_guia LOOP
    IF it.cantidad_cajas IS NULL OR it.cantidad_cajas < 0 THEN
      RAISE EXCEPTION 'Cantidad inválida en línea %', it.descripcion;
    END IF;
    IF it.lote_id IS NULL THEN
      RAISE EXCEPTION 'Falta lote en línea "%". Edita la guía y selecciona lote.', it.descripcion;
    END IF;
    IF it.ubicacion_id IS NULL THEN
      RAISE EXCEPTION 'Falta ubicación en línea "%". Edita la guía y selecciona ubicación.', it.descripcion;
    END IF;

    v_mov := public.registrar_movimiento(
      p_tipo := 'SALIDA'::tipo_mov_t,
      p_lote_id := it.lote_id,
      p_cantidad := it.cantidad_cajas,
      p_ubic_origen := it.ubicacion_id,
      p_ubic_destino := NULL,
      p_cliente_proveedor := g.cliente_id,
      p_nro_guia := g.codigo,
      p_nro_vale := NULL,
      p_motivo := 'Salida de venta',
      p_fecha := COALESCE(g.fecha_emision, CURRENT_DATE),
      p_observaciones := 'Guía ' || g.codigo || COALESCE(' · ' || NULLIF(g.transportista,''), ''),
      p_nro_warrant := NULL,
      p_latas := it.latas,
      p_piso := NULL,
      p_mercado_id := NULL,
      p_tiene_etiqueta := NULL,
      p_tercero := NULLIF(g.transportista,''),
      p_empaque := COALESCE(it.empaque, 48),
      p_donacion := false,
      p_autorizado := NULL
    );
    UPDATE public.ventas_guia_items SET movimiento_id = v_mov WHERE id = it.id;
    UPDATE public.movimientos SET guia_id = p_guia WHERE id = v_mov;
    IF it.orden_item_id IS NOT NULL THEN
      UPDATE public.ventas_orden_items
        SET cantidad_despachada_cajas = COALESCE(cantidad_despachada_cajas,0) + it.cantidad_cajas
        WHERE id = it.orden_item_id;
    END IF;
  END LOOP;

  UPDATE public.ventas_guias SET estado='EMITIDA', emitida_at = now() WHERE id = p_guia;

  IF g.orden_id IS NOT NULL THEN
    v_ov_id := g.orden_id;
    IF NOT EXISTS (
      SELECT 1 FROM public.ventas_orden_items
       WHERE orden_id = v_ov_id
         AND COALESCE(cantidad_despachada_cajas,0) < COALESCE(cantidad_cajas,0)
    ) THEN
      UPDATE public.ventas_ordenes SET estado='DESPACHADA' WHERE id = v_ov_id AND estado NOT IN ('FACTURADA','ANULADA');
    ELSE
      UPDATE public.ventas_ordenes SET estado='PARCIAL' WHERE id = v_ov_id AND estado NOT IN ('FACTURADA','DESPACHADA','ANULADA');
    END IF;
  END IF;
END $function$;