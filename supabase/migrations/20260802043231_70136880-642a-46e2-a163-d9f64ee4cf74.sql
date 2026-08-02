CREATE OR REPLACE FUNCTION public.recalc_saldos_insumo(p_insumo uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM set_config('app.bypass_movimientos_block', 'true', true);
  WITH base AS (
    SELECT COALESCE((SELECT saldo_inicial FROM insumos WHERE id = p_insumo), 0) AS ini
  ), calc AS (
    SELECT m.id,
           (SELECT ini FROM base) + SUM(CASE WHEN m.clase = 'INGRESO' THEN m.cantidad ELSE -m.cantidad END)
             OVER (ORDER BY m.fecha, m.created_at, m.id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS post
    FROM insumos_movimientos m
    WHERE m.insumo_id = p_insumo
  )
  UPDATE insumos_movimientos m
     SET saldo_post = c.post
    FROM calc c
   WHERE m.id = c.id AND (m.saldo_post IS DISTINCT FROM c.post);
END $$;

REVOKE ALL ON FUNCTION public.recalc_saldos_insumo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recalc_saldos_insumo(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.tg_recalc_saldos_insumo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NULL;
  END IF;
  IF TG_OP <> 'INSERT' THEN
    PERFORM public.recalc_saldos_insumo(OLD.insumo_id);
  END IF;
  IF TG_OP <> 'DELETE' AND (TG_OP = 'INSERT' OR NEW.insumo_id IS DISTINCT FROM OLD.insumo_id) THEN
    PERFORM public.recalc_saldos_insumo(NEW.insumo_id);
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_recalc_saldos_insumo ON public.insumos_movimientos;
CREATE TRIGGER trg_recalc_saldos_insumo
AFTER INSERT OR UPDATE OR DELETE ON public.insumos_movimientos
FOR EACH ROW EXECUTE FUNCTION public.tg_recalc_saldos_insumo();

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT DISTINCT insumo_id FROM insumos_movimientos LOOP
    PERFORM public.recalc_saldos_insumo(r.insumo_id);
  END LOOP;
END $$;