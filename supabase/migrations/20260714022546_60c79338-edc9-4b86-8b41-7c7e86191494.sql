
-- Fix search_path on _admin_table_allowed
ALTER FUNCTION public._admin_table_allowed(text) SET search_path = public;

-- Revoke EXECUTE from PUBLIC and anon on all SECURITY DEFINER functions in public schema.
-- Trigger functions and internal helpers: also revoke from authenticated.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args, p.prorettype
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC, anon', r.proname, r.args);
    -- Trigger functions must not be callable directly
    IF r.prorettype = 'trigger'::regtype THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM authenticated', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

-- Also revoke from internal recalc helper (not called from client)
REVOKE EXECUTE ON FUNCTION public._admin_recalc_mov(uuid, uuid, uuid) FROM authenticated;
