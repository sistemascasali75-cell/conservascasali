ALTER TABLE public.lances_produccion 
  ADD COLUMN IF NOT EXISTS envasado_cajas integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS envasado_latas integer NOT NULL DEFAULT 0;