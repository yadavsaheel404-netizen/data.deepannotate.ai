
-- Submission status enum
CREATE TYPE public.submission_status AS ENUM ('pending', 'approved', 'rejected');

-- Submissions table
CREATE TABLE public.submissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  contributor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_url TEXT,
  text_content TEXT,
  status submission_status NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Updated_at trigger
CREATE TRIGGER update_submissions_updated_at
  BEFORE UPDATE ON public.submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;

-- Contributors can view their own submissions
CREATE POLICY "Contributors can view own submissions"
  ON public.submissions FOR SELECT TO authenticated
  USING (auth.uid() = contributor_id);

-- Contributors can insert their own submissions
CREATE POLICY "Contributors can insert own submissions"
  ON public.submissions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = contributor_id);

-- Admins can manage all submissions
CREATE POLICY "Admins can manage all submissions"
  ON public.submissions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Increment filled_slots on new submission
CREATE OR REPLACE FUNCTION public.increment_filled_slots()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.tasks
  SET filled_slots = filled_slots + 1
  WHERE id = NEW.task_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_submission_increment_slots
  AFTER INSERT ON public.submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.increment_filled_slots();

-- Storage bucket for submissions
INSERT INTO storage.buckets (id, name, public)
VALUES ('submissions', 'submissions', false);

-- Storage RLS: contributors can upload to their own folder
CREATE POLICY "Contributors can upload submissions"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'submissions' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Contributors can read their own uploads
CREATE POLICY "Contributors can read own submissions"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'submissions' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Admins can read all submission files
CREATE POLICY "Admins can read all submissions"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'submissions' AND public.has_role(auth.uid(), 'admin'));
