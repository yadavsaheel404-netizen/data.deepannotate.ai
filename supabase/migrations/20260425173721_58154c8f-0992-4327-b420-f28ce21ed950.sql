
-- Helper: user is active (or is admin)
CREATE OR REPLACE FUNCTION public.is_user_active(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id AND is_active = true
  ) OR public.has_role(_user_id, 'admin'::app_role)
$$;

-- ============ tasks (submissions) table ============
DROP POLICY IF EXISTS "Contributors can view own submissions" ON public.tasks;
DROP POLICY IF EXISTS "Contributors can insert own submissions" ON public.tasks;
DROP POLICY IF EXISTS "Contributors can update own in_review submissions" ON public.tasks;

CREATE POLICY "Contributors can view own submissions"
ON public.tasks FOR SELECT TO authenticated
USING (auth.uid() = user_id AND public.is_user_active(auth.uid()));

CREATE POLICY "Contributors can insert own submissions"
ON public.tasks FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id AND public.is_user_active(auth.uid()));

CREATE POLICY "Contributors can update own in_review submissions"
ON public.tasks FOR UPDATE TO authenticated
USING (auth.uid() = user_id AND status = 'in_review'::submission_status AND public.is_user_active(auth.uid()))
WITH CHECK (auth.uid() = user_id AND status = 'in_review'::submission_status AND public.is_user_active(auth.uid()));

-- ============ projects table ============
DROP POLICY IF EXISTS "Contributors can view active tasks" ON public.projects;

CREATE POLICY "Contributors can view active tasks"
ON public.projects FOR SELECT TO authenticated
USING (status = 'active'::task_status AND public.is_user_active(auth.uid()));

-- ============ storage.objects (submissions bucket) ============
DROP POLICY IF EXISTS "Contributors can read own submissions" ON storage.objects;
DROP POLICY IF EXISTS "Contributors can view own submissions" ON storage.objects;
DROP POLICY IF EXISTS "Contributors can upload submissions" ON storage.objects;
DROP POLICY IF EXISTS "Contributors can update own submissions" ON storage.objects;

CREATE POLICY "Contributors can read own submissions"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'submissions'
  AND (storage.foldername(name))[2] = (auth.uid())::text
  AND public.is_user_active(auth.uid())
);

CREATE POLICY "Contributors can upload submissions"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'submissions'
  AND (storage.foldername(name))[2] = (auth.uid())::text
  AND public.is_user_active(auth.uid())
);

CREATE POLICY "Contributors can update own submissions"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'submissions'
  AND (storage.foldername(name))[2] = (auth.uid())::text
  AND public.is_user_active(auth.uid())
)
WITH CHECK (
  bucket_id = 'submissions'
  AND (storage.foldername(name))[2] = (auth.uid())::text
  AND public.is_user_active(auth.uid())
);
