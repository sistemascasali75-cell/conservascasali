CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.email IN ('sistemascasali7510@gmail.com','sistemascasali75@gmail.com','sistemascasali753@gmail.com') THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'ADMIN')
      ON CONFLICT (user_id, role) DO NOTHING;
  ELSIF NOT EXISTS (SELECT 1 FROM public.user_roles) THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'ADMIN');
  ELSE
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'ALMACENERO');
  END IF;
  RETURN NEW;
END $function$;

-- Si el usuario admin ya existe, asegurar rol ADMIN
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'ADMIN'::app_role FROM auth.users WHERE email = 'sistemascasali7510@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;