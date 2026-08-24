
-- Fix 1: Prevent contributors from changing submission status (self-approval bypass)
-- Drop the existing overly permissive policy
DROP POLICY IF EXISTS "Contributors can update own submissions" ON public.submissions;

-- New policy: contributors can only update their own submissions while status remains 'pending'
-- This prevents them from changing the status field
CREATE POLICY "Contributors can update own pending submissions"
ON public.submissions FOR UPDATE
TO authenticated
USING (auth.uid() = contributor_id AND status = 'pending')
WITH CHECK (auth.uid() = contributor_id AND status = 'pending');

-- Fix 2: Add UPDATE and DELETE policies for resumes storage bucket
CREATE POLICY "Users can update own resumes"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'resumes' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete own resumes"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'resumes' AND (storage.foldername(name))[1] = auth.uid()::text);
