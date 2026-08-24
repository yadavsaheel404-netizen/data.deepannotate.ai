-- Add public_user_id to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS public_user_id text;

-- Generator function: DF-XXXXXX (6 digits), retries on collision
CREATE OR REPLACE FUNCTION public.generate_public_user_id()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  candidate text;
  attempts int := 0;
BEGIN
  LOOP
    candidate := 'DF-' || lpad((floor(random() * 1000000))::int::text, 6, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE public_user_id = candidate);
    attempts := attempts + 1;
    IF attempts > 50 THEN
      candidate := 'DF-' || lpad((floor(random() * 1000000))::int::text, 6, '0')
                   || substr(replace(gen_random_uuid()::text, '-', ''), 1, 4);
      EXIT;
    END IF;
  END LOOP;
  RETURN candidate;
END;
$$;

-- Backfill existing rows
DO $$
DECLARE r record; new_id text;
BEGIN
  FOR r IN SELECT id FROM public.profiles WHERE public_user_id IS NULL LOOP
    new_id := public.generate_public_user_id();
    UPDATE public.profiles SET public_user_id = new_id WHERE id = r.id;
  END LOOP;
END $$;

-- Enforce NOT NULL + unique
ALTER TABLE public.profiles
  ALTER COLUMN public_user_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_public_user_id_key
  ON public.profiles (public_user_id);

-- BEFORE INSERT trigger: auto-assign on new profiles
CREATE OR REPLACE FUNCTION public.assign_public_user_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.public_user_id IS NULL OR btrim(NEW.public_user_id) = '' THEN
    NEW.public_user_id := public.generate_public_user_id();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_assign_public_user_id ON public.profiles;
CREATE TRIGGER profiles_assign_public_user_id
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_public_user_id();

-- Prevent updates to public_user_id once set
CREATE OR REPLACE FUNCTION public.prevent_public_user_id_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.public_user_id IS NOT NULL
     AND NEW.public_user_id IS DISTINCT FROM OLD.public_user_id THEN
    NEW.public_user_id := OLD.public_user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_prevent_public_user_id_change ON public.profiles;
CREATE TRIGGER profiles_prevent_public_user_id_change
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_public_user_id_change();

-- Lookup helper for tipping (returns minimal public info)
CREATE OR REPLACE FUNCTION public.get_user_by_public_id(_public_user_id text)
RETURNS TABLE(id uuid, public_user_id text, display_name text, avatar_url text, is_active boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, public_user_id, display_name, avatar_url, is_active
  FROM public.profiles
  WHERE public_user_id = _public_user_id
  LIMIT 1;
$$;