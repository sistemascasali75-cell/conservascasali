
-- Trigger to assign default role on new signups
DROP TRIGGER IF EXISTS on_auth_user_created_role ON auth.users;
CREATE TRIGGER on_auth_user_created_role
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_role();

-- Admin function: list all users with their roles
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE(user_id uuid, email text, created_at timestamptz, last_sign_in_at timestamptz, roles app_role[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'ADMIN') THEN
    RAISE EXCEPTION 'Solo ADMIN puede listar usuarios';
  END IF;
  RETURN QUERY
  SELECT u.id, u.email::text, u.created_at, u.last_sign_in_at,
    COALESCE(array_agg(ur.role) FILTER (WHERE ur.role IS NOT NULL), ARRAY[]::app_role[]) AS roles
  FROM auth.users u
  LEFT JOIN public.user_roles ur ON ur.user_id = u.id
  GROUP BY u.id, u.email, u.created_at, u.last_sign_in_at
  ORDER BY u.created_at DESC;
END $$;

-- Admin function: set roles for a user (replaces all)
CREATE OR REPLACE FUNCTION public.admin_set_user_roles(p_user uuid, p_roles app_role[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'ADMIN') THEN
    RAISE EXCEPTION 'Solo ADMIN puede asignar roles';
  END IF;
  IF p_user = auth.uid() AND NOT ('ADMIN' = ANY(p_roles)) THEN
    RAISE EXCEPTION 'No puedes quitarte el rol ADMIN a ti mismo';
  END IF;
  DELETE FROM public.user_roles WHERE user_id = p_user;
  IF p_roles IS NOT NULL AND array_length(p_roles, 1) > 0 THEN
    INSERT INTO public.user_roles(user_id, role)
    SELECT p_user, unnest(p_roles)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_roles(uuid, app_role[]) TO authenticated;
