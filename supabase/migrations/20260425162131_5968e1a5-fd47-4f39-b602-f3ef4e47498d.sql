-- Update submissions bucket RLS to support new path structure:
-- {project_id}/{user_id}/{task_uuid}/{file_name}
-- user_id is now at folder index [2] instead of [1].

DROP POLICY IF EXISTS "Contributors can upload submissions" ON storage.objects;
DROP POLICY IF EXISTS "Contributors can read own submissions" ON storage.objects;

CREATE POLICY "Contributors can upload submissions"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'submissions'
  AND (storage.foldername(name))[2] = (auth.uid())::text
);

CREATE POLICY "Contributors can read own submissions"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'submissions'
  AND (storage.foldername(name))[2] = (auth.uid())::text
);
