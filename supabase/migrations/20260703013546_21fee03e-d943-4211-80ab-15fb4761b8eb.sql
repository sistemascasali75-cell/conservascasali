
DROP FUNCTION IF EXISTS public.venta_anular_guia(uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.venta_emitir_guia(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.venta_generar_guia(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.venta_generar_factura(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.venta_generar_orden(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.recalc_venta_totales(text, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.next_correlativo(text) CASCADE;
DROP FUNCTION IF EXISTS public.tg_venta_item_importe() CASCADE;
DROP FUNCTION IF EXISTS public.tg_recalc_cot() CASCADE;
DROP FUNCTION IF EXISTS public.tg_recalc_ov() CASCADE;
DROP FUNCTION IF EXISTS public.tg_recalc_fac() CASCADE;
DROP FUNCTION IF EXISTS public.tg_asignar_codigo() CASCADE;

DROP TABLE IF EXISTS public.ventas_guia_items CASCADE;
DROP TABLE IF EXISTS public.ventas_guias CASCADE;
DROP TABLE IF EXISTS public.ventas_factura_items CASCADE;
DROP TABLE IF EXISTS public.ventas_facturas CASCADE;
DROP TABLE IF EXISTS public.ventas_orden_items CASCADE;
DROP TABLE IF EXISTS public.ventas_ordenes CASCADE;
DROP TABLE IF EXISTS public.ventas_cot_items CASCADE;
DROP TABLE IF EXISTS public.ventas_cotizaciones CASCADE;
DROP TABLE IF EXISTS public.ventas_correlativos CASCADE;
