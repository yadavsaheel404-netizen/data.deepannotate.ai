-- Fix ON CONFLICT target in upsert_firebase_profile to match user_roles_user_id_unique constraint
CREATE OR REPLACE FUNCTION public.upsert_firebase_profile(
  p_id          UUID,
  p_firebase_uid TEXT,
  p_email       TEXT,
  p_display_name TEXT
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles;
BEGIN
  INSERT INTO public.profiles (id, firebase_uid, email, display_name, onboarding_complete, profile_completed)
  VALUES (p_id, p_firebase_uid, p_email, p_display_name, false, false)
  ON CONFLICT (firebase_uid) DO UPDATE
    SET
      email        = EXCLUDED.email,
      display_name = COALESCE(NULLIF(EXCLUDED.display_name, ''), public.profiles.display_name),
      updated_at   = now()
  RETURNING * INTO v_profile;

  -- Ensure a default role row exists if none present, without overwriting existing role (e.g. admin)
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_profile.id, 'contributor')
  ON CONFLICT (user_id) DO NOTHING;

  RETURN v_profile;
END;
$$;
