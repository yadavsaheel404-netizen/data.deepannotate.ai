-- 1. Add KYC columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS gender TEXT,
  ADD COLUMN IF NOT EXISTS date_of_birth DATE,
  ADD COLUMN IF NOT EXISTS govt_id_type TEXT,
  ADD COLUMN IF NOT EXISTS govt_id_url TEXT,
  ADD COLUMN IF NOT EXISTS govt_id_uploaded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS govt_id_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS kyc_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS kyc_rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS kyc_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS kyc_reviewed_by UUID;

-- Soft-validate kyc_status values via trigger (avoids CHECK constraint pitfalls)
CREATE OR REPLACE FUNCTION public.validate_kyc_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.kyc_status NOT IN ('pending', 'verified', 'rejected') THEN
    RAISE EXCEPTION 'Invalid kyc_status: %', NEW.kyc_status;
  END IF;

  IF NEW.gender IS NOT NULL AND NEW.gender NOT IN ('male','female','other','prefer_not_to_say') THEN
    RAISE EXCEPTION 'Invalid gender: %', NEW.gender;
  END IF;

  IF NEW.date_of_birth IS NOT NULL AND NEW.date_of_birth > (CURRENT_DATE - INTERVAL '18 years') THEN
    RAISE EXCEPTION 'Must be at least 18 years old';
  END IF;

  -- Auto-reset to pending when document is changed (unless admin is reviewing)
  IF TG_OP = 'UPDATE'
     AND NEW.govt_id_url IS DISTINCT FROM OLD.govt_id_url
     AND NEW.govt_id_url IS NOT NULL
     AND NEW.kyc_status = OLD.kyc_status THEN
    NEW.kyc_status := 'pending';
    NEW.govt_id_verified := false;
    NEW.govt_id_uploaded_at := now();
    NEW.kyc_rejection_reason := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_kyc_on_profile ON public.profiles;
CREATE TRIGGER validate_kyc_on_profile
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.validate_kyc_status();

-- 2. Private storage bucket for KYC docs
INSERT INTO storage.buckets (id, name, public)
VALUES ('kyc-documents', 'kyc-documents', false)
ON CONFLICT (id) DO NOTHING;

-- 3. Storage RLS — owner-folder pattern + admin override
DROP POLICY IF EXISTS "Users can upload own kyc docs" ON storage.objects;
CREATE POLICY "Users can upload own kyc docs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'kyc-documents'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "Users can update own kyc docs" ON storage.objects;
CREATE POLICY "Users can update own kyc docs"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'kyc-documents'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "Users can read own kyc docs" ON storage.objects;
CREATE POLICY "Users can read own kyc docs"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'kyc-documents'
  AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR public.has_role(auth.uid(), 'admin')
  )
);

DROP POLICY IF EXISTS "Admins manage kyc docs" ON storage.objects;
CREATE POLICY "Admins manage kyc docs"
ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'kyc-documents' AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (bucket_id = 'kyc-documents' AND public.has_role(auth.uid(), 'admin'));