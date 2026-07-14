
ALTER TYPE public.app_role RENAME VALUE 'SUPERVISOR' TO 'OPERADOR';
ALTER TYPE public.app_role RENAME VALUE 'ALMACENERO' TO 'VISITA';

-- Actualizar función que verifica operador/admin (mantiene mismo nombre por compatibilidad
-- pero ahora considera 'OPERADOR' en lugar de 'SUPERVISOR')
CREATE OR REPLACE FUNCTION public.is_supervisor_or_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('ADMIN','OPERADOR')) $$;

-- Alias con nombre nuevo (más claro)
CREATE OR REPLACE FUNCTION public.is_operador_or_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('ADMIN','OPERADOR')) $$;

REVOKE EXECUTE ON FUNCTION public.is_operador_or_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_operador_or_admin(uuid) TO authenticated;

-- Nuevos usuarios: rol VISITA por defecto (excepto correos admin predeterminados)
CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.email IN ('sistemascasali7510@gmail.com','sistemascasali75@gmail.com','sistemascasali753@gmail.com') THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'ADMIN')
      ON CONFLICT (user_id, role) DO NOTHING;
  ELSIF NOT EXISTS (SELECT 1 FROM public.user_roles) THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'ADMIN');
  ELSE
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'VISITA');
  END IF;
  RETURN NEW;
END $$;
