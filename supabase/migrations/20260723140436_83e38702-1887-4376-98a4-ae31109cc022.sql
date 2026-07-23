ALTER TABLE public.lances_produccion
  ADD COLUMN IF NOT EXISTS petroleo numeric NULL,
  ADD COLUMN IF NOT EXISTS petroleo_unidad text NULL DEFAULT 'GAL',
  ADD COLUMN IF NOT EXISTS hora_registro time NULL DEFAULT (now() AT TIME ZONE 'America/Lima')::time;

UPDATE public.lances_produccion
   SET hora_registro = (created_at AT TIME ZONE 'America/Lima')::time
 WHERE hora_registro IS NULL;