REVOKE EXECUTE ON FUNCTION public.ensure_super_admin_role() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_super_admin_role() FROM PUBLIC, anon, authenticated;