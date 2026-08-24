
ALTER TABLE public.profiles ALTER COLUMN language DROP DEFAULT;
ALTER TABLE public.profiles ALTER COLUMN language TYPE text[] USING ARRAY[COALESCE(language, 'en')];
ALTER TABLE public.profiles ALTER COLUMN language SET DEFAULT '{en}'::text[];
