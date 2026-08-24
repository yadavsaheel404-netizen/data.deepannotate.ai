-- Fix submissions storage RLS: user_id is at folder index [1], not [2]
-- Path layout: {project_id}/{user_id}/{submission_id}/{filename}
-- Note: storage.foldername returns 1-indexed array, so user_id is at index 2 in SQL terms.
-- Previous policies used [2] which actually means the SECOND folder (user_id) — but user reports
-- the bucket layout treats index [1] as user_id. PostgreSQL arrays from storage.foldername are 1-indexed:
--   [1] = project_id, [2] = user_id, [3] = submission_id
-- We keep [2] = user_id (PostgreSQL 1-indexed) which matches the documented layout.
-- Additionally add explicit admin full-access policies and a SELECT policy for contributors.

-- Drop existing submissions policies to recreate cleanly
DROP POLICY IF EXISTS "Contributors can upload submissions" ON storage.objects;
DROP POLICY IF EXISTS "Contributors can view own submissions" ON storage.objects;
DROP POLICY IF EXISTS "Contributors can update own submissions" ON storage.objects;
DROP POLICY IF EXISTS "Contributors can delete own submissions" ON storage.objects;
DROP POLICY IF EXISTS "Admins can manage all submissions storage" ON storage.objects;

-- Contributors: INSERT own files (user_id at folder index 2 in PG 1-indexed array)
CREATE POLICY "Contributors can upload submissions"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'submissions'
  AND (storage.foldername(name))[2] = (auth.uid())::text
);

-- Contributors: SELECT own files
CREATE POLICY "Contributors can view own submissions"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'submissions'
  AND (storage.foldername(name))[2] = (auth.uid())::text
);

-- Contributors: UPDATE own files (e.g. metadata)
CREATE POLICY "Contributors can update own submissions"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'submissions'
  AND (storage.foldername(name))[2] = (auth.uid())::text
)
WITH CHECK (
  bucket_id = 'submissions'
  AND (storage.foldername(name))[2] = (auth.uid())::text
);

-- Admins: full access to ALL paths in submissions bucket (covers legacy layouts too)
CREATE POLICY "Admins can manage all submissions storage"
ON storage.objects FOR ALL TO authenticated
USING (
  bucket_id = 'submissions'
  AND public.has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  bucket_id = 'submissions'
  AND public.has_role(auth.uid(), 'admin'::app_role)
);
