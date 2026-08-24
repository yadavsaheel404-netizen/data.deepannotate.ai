-- Clean up duplicate user roles
DELETE FROM public.user_roles a
USING public.user_roles b
WHERE a.user_id = b.user_id AND a.id > b.id;

-- Safely add unique constraint on user_id
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_unique;
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_unique UNIQUE (user_id);
