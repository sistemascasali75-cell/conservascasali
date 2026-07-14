-- Índices para acelerar lecturas frecuentes del WMS
CREATE INDEX IF NOT EXISTS idx_stock_lote_ubicacion_lote ON public.stock_lote_ubicacion(lote_id);
CREATE INDEX IF NOT EXISTS idx_stock_lote_ubicacion_ubic ON public.stock_lote_ubicacion(ubicacion_id);
CREATE INDEX IF NOT EXISTS idx_ubicaciones_almacen ON public.ubicaciones(almacen_id);
CREATE INDEX IF NOT EXISTS idx_lotes_producto ON public.lotes(producto_id);
CREATE INDEX IF NOT EXISTS idx_lotes_estado ON public.lotes(estado);
CREATE INDEX IF NOT EXISTS idx_lotes_fecha_venc ON public.lotes(fecha_vencimiento);
CREATE INDEX IF NOT EXISTS idx_movimientos_lote ON public.movimientos(lote_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_fecha ON public.movimientos(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_movimientos_created ON public.movimientos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_movimientos_tipo ON public.movimientos(tipo);
CREATE INDEX IF NOT EXISTS idx_movimientos_cliente ON public.movimientos(cliente_proveedor_id);
CREATE INDEX IF NOT EXISTS idx_warrants_lote_estado ON public.warrants(lote_id, estado);
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_inventario_conteo_inv ON public.inventario_conteo(inventario_id);