
ALTER TABLE public.movimientos
  ADD COLUMN IF NOT EXISTS inicia_warrant date,
  ADD COLUMN IF NOT EXISTS vence_warrant date;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'ventas_cotizaciones_cliente_id_fkey'
      AND table_name = 'ventas_cotizaciones'
  ) THEN
    ALTER TABLE public.ventas_cotizaciones
      ADD CONSTRAINT ventas_cotizaciones_cliente_id_fkey
      FOREIGN KEY (cliente_id) REFERENCES public.clientes_proveedores(id) ON DELETE RESTRICT;
  END IF;
END $$;
