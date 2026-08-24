-- Make support-screenshots bucket private
UPDATE storage.buckets SET public = false WHERE id = 'support-screenshots';

-- Drop the broad public read policy
DROP POLICY IF EXISTS "Anyone can view support screenshots" ON storage.objects;

-- Owner-scoped read: user can only read their own screenshots (uploaded under {user_id}/...)
CREATE POLICY "Users can read own support screenshots"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'support-screenshots'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);
