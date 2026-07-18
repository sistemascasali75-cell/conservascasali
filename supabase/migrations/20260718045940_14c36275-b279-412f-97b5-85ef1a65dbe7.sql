ALTER TABLE public.lances_produccion 
  ADD COLUMN IF NOT EXISTS packing integer NOT NULL DEFAULT 48,
  ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'COMPLETO';

ALTER TABLE public.lances_produccion 
  DROP CONSTRAINT IF EXISTS lances_produccion_estado_chk;
ALTER TABLE public.lances_produccion 
  ADD CONSTRAINT lances_produccion_estado_chk CHECK (estado IN ('BORRADOR','COMPLETO'));