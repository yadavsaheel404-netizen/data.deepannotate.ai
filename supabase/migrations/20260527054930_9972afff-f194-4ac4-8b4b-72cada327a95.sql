
-- 1. Realtime channel authorization (handled by Supabase internal settings, commented out due to permission limits on hosted instances)
-- ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
-- DROP POLICY IF EXISTS "Authenticated users can use realtime" ON realtime.messages;
-- CREATE POLICY "Authenticated users can use realtime" ON realtime.messages FOR SELECT TO authenticated USING (true);
-- DROP POLICY IF EXISTS "Authenticated users can send realtime" ON realtime.messages;
-- CREATE POLICY "Authenticated users can send realtime" ON realtime.messages FOR INSERT TO authenticated WITH CHECK (true);

-- 2. Allow contributors to view audit history of their own submissions
DROP POLICY IF EXISTS "Users can view own submission audit" ON public.submission_status_audit;
CREATE POLICY "Users can view own submission audit"
ON public.submission_status_audit
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = submission_status_audit.submission_id
      AND t.user_id = auth.uid()
  )
);

-- 3. Allow contributors to upload submission files to the submissions bucket
DROP POLICY IF EXISTS "Contributors can upload own submission files" ON storage.objects;
CREATE POLICY "Contributors can upload own submission files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'submissions'
  AND (storage.foldername(name))[2] = auth.uid()::text
  AND public.is_user_active(auth.uid())
);
