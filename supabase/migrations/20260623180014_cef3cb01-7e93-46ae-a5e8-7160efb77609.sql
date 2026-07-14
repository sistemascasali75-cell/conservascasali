
-- Fix SECURITY DEFINER view: switch to security_invoker
ALTER VIEW public.v_stock_lote SET (security_invoker = true);

-- Revoke EXECUTE from anon/public on SECURITY DEFINER functions; grant to authenticated only.
DO $$
DECLARE r RECORD; sig TEXT;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef=true
  LOOP
    sig := format('public.%I(%s)', r.proname, r.args);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', sig);
  END LOOP;
END $$;
