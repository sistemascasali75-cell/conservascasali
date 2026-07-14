
CREATE OR REPLACE FUNCTION public.ventas_convertir_factura_a_guia(p_fac uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_fac record; v_gr uuid; v_cod text; v_num integer; v_email text;
BEGIN
  SELECT * INTO v_fac FROM public.ventas_facturas WHERE id = p_fac;
  IF v_fac IS NULL THEN RAISE EXCEPTION 'Factura no existe'; END IF;
  IF v_fac.estado = 'ANULADA' THEN RAISE EXCEPTION 'Factura anulada'; END IF;
  v_cod := public.ventas_next_codigo('T001');
  v_num := (regexp_replace(v_cod, '^T001-', ''))::integer;
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  INSERT INTO public.ventas_guias(serie, numero, codigo, orden_id, factura_id, cliente_id, motivo_traslado, observaciones, usuario_id, usuario_nombre)
    VALUES ('T001', v_num, v_cod, v_fac.orden_id, p_fac, v_fac.cliente_id, 'VENTA',
      'Guía por factura ' || v_fac.codigo, auth.uid(), v_email)
    RETURNING id INTO v_gr;
  INSERT INTO public.ventas_guia_items(guia_id, producto_id, descripcion, cantidad_cajas, empaque, lote_id, ubicacion_id, orden)
    SELECT v_gr, i.producto_id, i.descripcion, i.cantidad_cajas, i.empaque,
      (SELECT l.id FROM public.lotes l
         JOIN public.stock_lote_ubicacion s ON s.lote_id = l.id
        WHERE l.producto_id = i.producto_id AND s.cantidad_cajas > 0
        ORDER BY l.fecha_vencimiento ASC LIMIT 1),
      (SELECT s.ubicacion_id FROM public.stock_lote_ubicacion s
         JOIN public.lotes l ON l.id = s.lote_id
        WHERE l.producto_id = i.producto_id AND s.cantidad_cajas > 0
        ORDER BY l.fecha_vencimiento ASC, s.cantidad_cajas DESC LIMIT 1),
      i.orden
    FROM public.ventas_factura_items i WHERE i.factura_id = p_fac ORDER BY i.orden NULLS LAST;
  RETURN v_gr;
END $function$;

REVOKE EXECUTE ON FUNCTION public.ventas_convertir_factura_a_guia(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ventas_convertir_factura_a_guia(uuid) TO authenticated;
