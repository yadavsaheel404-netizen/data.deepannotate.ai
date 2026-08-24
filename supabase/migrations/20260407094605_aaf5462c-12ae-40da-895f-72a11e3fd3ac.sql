
-- Add new profile fields
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS resume_url text,
  ADD COLUMN IF NOT EXISTS linkedin_url text,
  ADD COLUMN IF NOT EXISTS github_url text,
  ADD COLUMN IF NOT EXISTS hours_per_week text,
  ADD COLUMN IF NOT EXISTS profile_completed boolean NOT NULL DEFAULT false;

-- Create resume storage bucket (private)
INSERT INTO storage.buckets (id, name, public) VALUES ('resumes', 'resumes', false)
ON CONFLICT (id) DO NOTHING;

-- RLS: users can upload their own resume
CREATE POLICY "Users can upload own resume"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'resumes' AND (storage.foldername(name))[1] = auth.uid()::text);

-- RLS: users can read their own resume
CREATE POLICY "Users can read own resume"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'resumes' AND (storage.foldername(name))[1] = auth.uid()::text);

-- RLS: admins can read all resumes
CREATE POLICY "Admins can read all resumes"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'resumes' AND public.has_role(auth.uid(), 'admin'));
