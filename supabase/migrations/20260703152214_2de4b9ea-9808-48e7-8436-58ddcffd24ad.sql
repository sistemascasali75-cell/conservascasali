CREATE OR REPLACE FUNCTION public.ventas_convertir_orden_a_factura(p_ov uuid, p_tipo text DEFAULT 'FACTURA'::text, p_serie text DEFAULT 'F001'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_ov record; v_cli record; v_fac uuid; v_cod text; v_num integer; v_email text;
BEGIN
  SELECT * INTO v_ov FROM public.ventas_ordenes WHERE id = p_ov;
  IF v_ov IS NULL THEN RAISE EXCEPTION 'Orden no existe'; END IF;
  SELECT * INTO v_cli FROM public.clientes_proveedores WHERE id = v_ov.cliente_id;
  v_cod := public.ventas_next_codigo(p_serie);
  v_num := (regexp_replace(v_cod, '^' || p_serie || '-', ''))::integer;
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  INSERT INTO public.ventas_facturas(serie, numero, codigo, tipo_comprobante, orden_id, cliente_id, cliente_ruc, cliente_razon_social,
    moneda, tipo_cambio, condicion_pago, observaciones, usuario_id, usuario_nombre)
    VALUES (p_serie, v_num, v_cod, p_tipo, p_ov, v_ov.cliente_id, v_cli.documento, v_cli.nombre,
      v_ov.moneda, v_ov.tipo_cambio, v_ov.condicion_pago, v_ov.observaciones, auth.uid(), v_email)
    RETURNING id INTO v_fac;
  INSERT INTO public.ventas_factura_items(factura_id, producto_id, descripcion, cantidad_cajas, empaque, unidad_precio, precio_unitario, descuento_pct, tipo_afectacion_igv, orden)
    SELECT v_fac, i.producto_id, i.descripcion, i.cantidad_cajas, i.empaque, 'CAJA', i.precio_unitario, i.descuento_pct, 'GRAVADO', i.orden
    FROM public.ventas_orden_items i WHERE i.orden_id = p_ov ORDER BY i.orden NULLS LAST;
  UPDATE public.ventas_ordenes SET estado = 'FACTURADA' WHERE id = p_ov;
  RETURN v_fac;
END $function$;