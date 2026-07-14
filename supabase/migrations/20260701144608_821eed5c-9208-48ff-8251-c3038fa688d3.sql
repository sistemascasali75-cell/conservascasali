ALTER TABLE public.movimientos DROP COLUMN total_latas;
ALTER TABLE public.movimientos ALTER COLUMN cantidad_cajas TYPE numeric(14,3);
ALTER TABLE public.movimientos ADD COLUMN total_latas numeric GENERATED ALWAYS AS ((COALESCE(cantidad_cajas, 0::numeric) * 48::numeric) + (COALESCE(latas, 0))::numeric) STORED;