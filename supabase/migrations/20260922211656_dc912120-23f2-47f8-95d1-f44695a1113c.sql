ALTER TABLE public.movimientos ADD COLUMN IF NOT EXISTS inventariado boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_movimientos_inventariado ON public.movimientos(inventariado) WHERE inventariado;
CREATE OR REPLACE FUNCTION public.set_movimiento_inventariado(p_id uuid, p_valor boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  UPDATE public.movimientos SET inventariado = p_valor WHERE id = p_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.set_movimiento_inventariado(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_movimiento_inventariado(uuid, boolean) TO authenticated;