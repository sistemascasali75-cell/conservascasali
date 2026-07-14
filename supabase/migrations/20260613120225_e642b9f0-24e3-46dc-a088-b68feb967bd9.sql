
CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.email = 'sistemascasali753@gmail.com' THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'ADMIN')
      ON CONFLICT (user_id, role) DO NOTHING;
  ELSIF NOT EXISTS (SELECT 1 FROM public.user_roles) THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'ADMIN');
  ELSE
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'ALMACENERO');
  END IF;
  RETURN NEW;
END $function$;

-- Trigger en auth.users (recrear por si no existía)
DROP TRIGGER IF EXISTS on_auth_user_created_role ON auth.users;
CREATE TRIGGER on_auth_user_created_role
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_role();

-- Si el usuario admin maestro ya existe pero no tiene rol ADMIN, asignarlo
INSERT INTO public.user_roles(user_id, role)
SELECT id, 'ADMIN'::app_role FROM auth.users WHERE email = 'sistemascasali753@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;
