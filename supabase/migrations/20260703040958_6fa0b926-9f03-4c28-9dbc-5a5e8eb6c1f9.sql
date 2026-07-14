ALTER TABLE public.ventas_orden_items ADD COLUMN IF NOT EXISTS unidad_precio text NOT NULL DEFAULT 'CAJA';

CREATE OR REPLACE FUNCTION public.tg_ventas_ov_item_calc()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE v_cant numeric;
BEGIN
  NEW.empaque := COALESCE(NEW.empaque, 48);
  NEW.cantidad_latas := COALESCE(NEW.cantidad_cajas,0) * NEW.empaque;
  v_cant := CASE WHEN COALESCE(NEW.unidad_precio,'CAJA')='LATA' THEN NEW.cantidad_latas ELSE COALESCE(NEW.cantidad_cajas,0) END;
  NEW.importe := round(v_cant * COALESCE(NEW.precio_unitario,0) * (1 - COALESCE(NEW.descuento_pct,0)/100.0), 2);
  RETURN NEW;
END $function$;