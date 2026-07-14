
-- 1) Asignar ADMIN inmediatamente si el usuario ya existe
INSERT INTO public.user_roles(user_id, role)
SELECT id, 'ADMIN'::app_role FROM auth.users
WHERE email = 'sistemascasali7510@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;

-- 2) Trigger que impide eliminar/cambiar el rol ADMIN de ese correo
CREATE OR REPLACE FUNCTION public.protect_super_admin_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_email text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT email INTO v_email FROM auth.users WHERE id = OLD.user_id;
    IF v_email = 'sistemascasali7510@gmail.com' AND OLD.role = 'ADMIN'::app_role THEN
      RAISE EXCEPTION 'No se puede quitar el rol ADMIN al super administrador (sistemascasali7510@gmail.com)';
    END IF;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    SELECT email INTO v_email FROM auth.users WHERE id = OLD.user_id;
    IF v_email = 'sistemascasali7510@gmail.com' AND OLD.role = 'ADMIN'::app_role AND NEW.role <> 'ADMIN'::app_role THEN
      RAISE EXCEPTION 'No se puede modificar el rol ADMIN del super administrador (sistemascasali7510@gmail.com)';
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_protect_super_admin_role ON public.user_roles;
CREATE TRIGGER trg_protect_super_admin_role
BEFORE UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.protect_super_admin_role();

-- 3) Trigger que re-asigna ADMIN si se detecta un intento de dejarlo sin ese rol
CREATE OR REPLACE FUNCTION public.ensure_super_admin_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE email = 'sistemascasali7510@gmail.com';
  IF v_uid IS NOT NULL THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (v_uid, 'ADMIN'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_ensure_super_admin_role ON public.user_roles;
CREATE TRIGGER trg_ensure_super_admin_role
AFTER DELETE OR UPDATE ON public.user_roles
FOR EACH STATEMENT EXECUTE FUNCTION public.ensure_super_admin_role();
