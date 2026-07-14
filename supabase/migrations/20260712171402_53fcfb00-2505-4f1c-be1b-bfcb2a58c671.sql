-- Fix 1: Revoke public/anon EXECUTE on SECURITY DEFINER function registrar_movimiento
REVOKE EXECUTE ON FUNCTION public.registrar_movimiento(
  tipo_mov_t, uuid, numeric, uuid, uuid, uuid, text, text, text, date, text, text, integer, integer, uuid, boolean, text, integer, boolean, text, date, date, integer
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_movimiento(
  tipo_mov_t, uuid, numeric, uuid, uuid, uuid, text, text, text, date, text, text, integer, integer, uuid, boolean, text, integer, boolean, text, date, date, integer
) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.registrar_movimiento(
  tipo_mov_t, uuid, numeric, uuid, uuid, uuid, text, text, text, date, text, text, integer, integer, uuid, boolean, text, integer, boolean, text, date, date
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_movimiento(
  tipo_mov_t, uuid, numeric, uuid, uuid, uuid, text, text, text, date, text, text, integer, integer, uuid, boolean, text, integer, boolean, text, date, date
) TO authenticated, service_role;

-- Fix 2: Ensure view runs with invoker's permissions (not creator's)
ALTER VIEW public.vista_lote_movimientos_latas SET (security_invoker = true);

-- Fix 3: Align is_supervisor_or_admin with the actual app_role enum (ADMIN, OPERADOR, VISITA, INSUMOS).
-- Explicitly cast role values to app_role so any future enum drift fails loudly at migration time.
CREATE OR REPLACE FUNCTION public.is_supervisor_or_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('ADMIN'::public.app_role, 'OPERADOR'::public.app_role)
  )
$$;
REVOKE EXECUTE ON FUNCTION public.is_supervisor_or_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_supervisor_or_admin(uuid) TO authenticated, service_role;