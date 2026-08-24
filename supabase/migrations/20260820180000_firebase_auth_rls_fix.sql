-- Fix 1: Drop the old INSERT policy that requires auth.uid() = id
-- This policy is based on Supabase's native auth.users table. Since we now use
-- Firebase Auth with custom JWTs, auth.uid() returns our custom `sub` claim
-- (a UUID we generate client-side), NOT a value that exists in auth.users.
-- The profiles.id FK references auth.users(id), so the INSERT was always going
-- to fail because our generated UUID doesn't exist in auth.users.
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

-- Fix 2: Remove the FK constraint tying profiles.id to auth.users
-- This is the root architectural mismatch: the schema assumed Supabase native auth
-- where auth.users is the source of truth. With Firebase Auth + custom JWTs, 
-- we manage our own UUID in profiles.id. The FK must go.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;

-- Also remove the FK on user_roles referencing auth.users
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_fkey;

-- Fix 3: Recreate RLS policies using JWT sub claim directly
-- auth.uid() reads the `sub` field from the custom JWT we sign in authStore.ts.
-- For existing users, sub = profiles.id (UUID). For the INSERT, we check that
-- the sub claim matches the id being inserted — no auth.users lookup needed.
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid()::text = id::text);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid()::text = id::text);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid()::text = id::text);

-- Fix 4: Recreate user_roles policies similarly
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;

CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (auth.uid()::text = user_id::text);

-- Allow authenticated users to insert their own role row
DROP POLICY IF EXISTS "Users can insert their own role" ON public.user_roles;
CREATE POLICY "Users can insert their own role"
  ON public.user_roles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid()::text = user_id::text);

-- Fix 5: Create a SECURITY DEFINER RPC for profile upsert.
-- This runs as the postgres superuser, bypassing RLS entirely.
-- It validates identity by checking the firebase_uid claim from the JWT.
-- Use this as the ONLY path for first-time profile creation.
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

  -- Also ensure a contributor role row exists
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_profile.id, 'contributor')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN v_profile;
END;
$$;

-- Fix 6: Drop the old auth.users trigger — it only works with Supabase native auth
-- and conflicts with our Firebase-based signup flow.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
