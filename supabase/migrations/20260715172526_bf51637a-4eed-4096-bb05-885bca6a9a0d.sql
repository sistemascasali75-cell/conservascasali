
CREATE OR REPLACE FUNCTION public.claim_role_with_password(p_role app_role, p_password text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expected text;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No autenticado' USING ERRCODE = '28000';
  END IF;

  v_expected := CASE p_role
    WHEN 'ADMIN'    THEN '2026'
    WHEN 'OPERADOR' THEN 'o2026'
    WHEN 'INSUMOS'  THEN 'i2026'
    WHEN 'VISITA'   THEN 'v2026'
    ELSE NULL
  END;

  IF v_expected IS NULL THEN
    RAISE EXCEPTION 'Rol no válido' USING ERRCODE = '22023';
  END IF;

  IF p_password IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'Contraseña de rol incorrecta' USING ERRCODE = '28P01';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_uid, p_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_role_with_password(app_role, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.claim_role_with_password(app_role, text) TO authenticated;
