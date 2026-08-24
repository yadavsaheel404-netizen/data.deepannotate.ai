-- Backfill any legacy empty/null display names from auth email so we can enforce NOT NULL
UPDATE public.profiles p
SET display_name = COALESCE(NULLIF(btrim(p.display_name), ''), u.email, 'User')
FROM auth.users u
WHERE p.id = u.id
  AND (p.display_name IS NULL OR btrim(p.display_name) = '');

-- Enforce non-empty display_name at the database level
ALTER TABLE public.profiles
  ALTER COLUMN display_name SET NOT NULL;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_display_name_not_empty;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_display_name_not_empty
  CHECK (btrim(display_name) <> '');

-- Update signup trigger to REQUIRE display_name from metadata; no silent email fallback
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  meta_name text;
BEGIN
  meta_name := btrim(COALESCE(NEW.raw_user_meta_data->>'display_name', ''));

  IF meta_name = '' THEN
    -- For OAuth providers, try common metadata fields before failing
    meta_name := btrim(COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      ''
    ));
  END IF;

  IF meta_name = '' THEN
    RAISE EXCEPTION 'Display name is required';
  END IF;

  INSERT INTO public.profiles (id, display_name, email)
  VALUES (NEW.id, meta_name, NEW.email)
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        display_name = COALESCE(NULLIF(btrim(public.profiles.display_name), ''), EXCLUDED.display_name);

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'contributor')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$function$;