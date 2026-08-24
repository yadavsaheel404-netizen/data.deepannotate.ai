
-- Add foreign key from submissions.contributor_id to profiles.id so joins work
ALTER TABLE public.submissions
  ADD CONSTRAINT submissions_contributor_profile_fk
  FOREIGN KEY (contributor_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Allow contributors to update their own submissions (for future use)
CREATE POLICY "Contributors can update own submissions"
  ON public.submissions FOR UPDATE TO authenticated
  USING (auth.uid() = contributor_id)
  WITH CHECK (auth.uid() = contributor_id);
