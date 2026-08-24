-- 1. Decouple auth.users foreign key constraints from public schema
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;

-- Update user_roles to reference profiles(id) instead of auth.users(id)
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_fkey;
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Update notifications to reference profiles(id) instead of auth.users(id)
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_user_id_fkey;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Update tasks (submissions) to reference profiles(id) instead of auth.users(id)
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_user_id_fkey;
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS submissions_contributor_id_fkey;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Update projects (created_by) to reference profiles(id)
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS tasks_created_by_fkey;
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_created_by_fkey;
ALTER TABLE public.projects ADD CONSTRAINT projects_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 2. Add Firebase UID column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS firebase_uid TEXT UNIQUE;

-- 3. Create Video Annotation Infrastructure (Additive Tables)
CREATE TABLE IF NOT EXISTS public.videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  duration_ms INTEGER,
  width INTEGER,
  height INTEGER,
  fps NUMERIC,
  codec TEXT,
  size_bytes BIGINT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.work_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  video_id UUID NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  segment_start_ms INTEGER NOT NULL,
  segment_end_ms INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'claimed', 'completed')),
  priority INTEGER NOT NULL DEFAULT 0,
  required_annotation_type TEXT NOT NULL DEFAULT 'bounding_box',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.work_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_id UUID NOT NULL REFERENCES public.work_items(id) ON DELETE CASCADE,
  contributor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'expired', 'released'))
);

CREATE TABLE IF NOT EXISTS public.annotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_id UUID NOT NULL REFERENCES public.work_items(id) ON DELETE CASCADE,
  contributor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  annotation_type TEXT NOT NULL,
  frame_number INTEGER,
  start_ms INTEGER,
  end_ms INTEGER,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Database Performance Indexes
CREATE INDEX IF NOT EXISTS idx_tasks_status_created_id ON public.tasks (status, created_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_tasks_project_user_status ON public.tasks (project_id, user_id, status);
CREATE INDEX IF NOT EXISTS idx_work_items_project_status_priority ON public.work_items (project_id, status, priority DESC);
CREATE INDEX IF NOT EXISTS idx_work_claims_status_expires ON public.work_claims (status, expires_at) WHERE (status = 'active');
CREATE INDEX IF NOT EXISTS idx_tokens_transactions_user_reason ON public.tokens_transactions (user_id, reason);
CREATE INDEX IF NOT EXISTS idx_videos_project ON public.videos (project_id);
CREATE INDEX IF NOT EXISTS idx_annotations_work_item ON public.annotations (work_item_id);

-- 5. Enable Row-Level Security
ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.annotations ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies
-- Videos
DROP POLICY IF EXISTS "Anyone authenticated can view videos" ON public.videos;
CREATE POLICY "Anyone authenticated can view videos" ON public.videos
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins can manage videos" ON public.videos;
CREATE POLICY "Admins can manage videos" ON public.videos
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Work Items
DROP POLICY IF EXISTS "Anyone authenticated can view work items" ON public.work_items;
CREATE POLICY "Anyone authenticated can view work items" ON public.work_items
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins can manage work items" ON public.work_items;
CREATE POLICY "Admins can manage work items" ON public.work_items
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Work Claims
DROP POLICY IF EXISTS "Contributors can view own claims" ON public.work_claims;
CREATE POLICY "Contributors can view own claims" ON public.work_claims
  FOR SELECT TO authenticated USING (auth.uid() = contributor_id);

DROP POLICY IF EXISTS "Contributors can create claims" ON public.work_claims;
CREATE POLICY "Contributors can create claims" ON public.work_claims
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = contributor_id);

DROP POLICY IF EXISTS "Contributors can update own claims" ON public.work_claims;
CREATE POLICY "Contributors can update own claims" ON public.work_claims
  FOR UPDATE TO authenticated USING (auth.uid() = contributor_id);

DROP POLICY IF EXISTS "Admins can manage all claims" ON public.work_claims;
CREATE POLICY "Admins can manage all claims" ON public.work_claims
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Annotations
DROP POLICY IF EXISTS "Contributors can view own annotations" ON public.annotations;
CREATE POLICY "Contributors can view own annotations" ON public.annotations
  FOR SELECT TO authenticated USING (auth.uid() = contributor_id);

DROP POLICY IF EXISTS "Contributors can insert annotations" ON public.annotations;
CREATE POLICY "Contributors can insert annotations" ON public.annotations
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = contributor_id);

DROP POLICY IF EXISTS "Contributors can update own annotations" ON public.annotations;
CREATE POLICY "Contributors can update own annotations" ON public.annotations
  FOR UPDATE TO authenticated USING (auth.uid() = contributor_id);

DROP POLICY IF EXISTS "Admins can view all annotations" ON public.annotations;
CREATE POLICY "Admins can view all annotations" ON public.annotations
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 7. Concurrent Claim Allocation Function
-- (Full function body follows below)
CREATE OR REPLACE FUNCTION public.claim_work_item(_project_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id UUID := auth.uid();
  existing_work_item_id UUID;
  target_work_item_id UUID;
  claim_expiry TIMESTAMPTZ := now() + INTERVAL '30 minutes';
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  -- Sweep expired claims
  UPDATE public.work_claims
  SET status = 'expired'
  WHERE status = 'active' AND expires_at < now();

  UPDATE public.work_items
  SET status = 'available'
  WHERE status = 'claimed' AND id IN (
    SELECT work_item_id FROM public.work_claims WHERE status = 'expired'
  );

  -- Check for existing active claim by caller for this project
  SELECT wc.work_item_id INTO existing_work_item_id
  FROM public.work_claims wc
  JOIN public.work_items wi ON wi.id = wc.work_item_id
  WHERE wc.contributor_id = caller_id
    AND wc.status = 'active'
    AND wi.project_id = _project_id
  LIMIT 1;

  IF existing_work_item_id IS NOT NULL THEN
    RETURN existing_work_item_id;
  END IF;

  -- Lock and claim next available work item
  SELECT id INTO target_work_item_id
  FROM public.work_items
  WHERE project_id = _project_id
    AND status = 'available'
  ORDER BY priority DESC, created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF target_work_item_id IS NULL THEN
    RAISE EXCEPTION 'NO_WORK_AVAILABLE';
  END IF;

  -- Mark work item as claimed and insert claim record
  UPDATE public.work_items
  SET status = 'claimed'
  WHERE id = target_work_item_id;

  INSERT INTO public.work_claims (work_item_id, contributor_id, expires_at, status)
  VALUES (target_work_item_id, caller_id, claim_expiry, 'active');

  RETURN target_work_item_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_work_item(UUID) TO authenticated;

-- 8. Optimized Targeted Project Feed with Server-Side Count Aggregation
CREATE OR REPLACE FUNCTION public.get_visible_projects_with_counts()
RETURNS TABLE (
  id UUID,
  title TEXT,
  overview TEXT,
  instructions TEXT,
  media_type public.media_type,
  duration_minutes INTEGER,
  duration_label TEXT,
  total_tasks INTEGER,
  filled_tasks INTEGER,
  visible_till TIMESTAMP WITH TIME ZONE,
  languages TEXT[],
  status public.task_status,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE,
  pay_per_task NUMERIC,
  reward_tokens INTEGER,
  payment_terms TEXT,
  start_date TIMESTAMP WITH TIME ZONE,
  end_date TIMESTAMP WITH TIME ZONE,
  dos TEXT[],
  donts TEXT[],
  sample_media_urls TEXT[],
  example_media JSONB,
  project_type TEXT,
  max_file_size_mb INTEGER,
  visibility_type TEXT,
  target_filters JSONB,
  submissions_count INTEGER,
  approved_count INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  u_gender text;
  u_languages text[];
  u_skills text[];
  u_status text;
  u_profession text;
BEGIN
  IF uid IS NOT NULL THEN
    SELECT gender, language, skills, current_status, working_profession
      INTO u_gender, u_languages, u_skills, u_status, u_profession
      FROM public.profiles
      WHERE id = uid;
  END IF;

  RETURN QUERY
  WITH filtered_projects AS (
    SELECT p.*
      FROM public.projects p
     WHERE p.status = 'active'
       AND (
         p.visibility_type = 'everyone'
         OR (
           p.visibility_type = 'targeted'
           AND (
             (
               COALESCE(jsonb_array_length(NULLIF(p.target_filters->'gender', 'null'::jsonb)), 0) = 0
               AND COALESCE(jsonb_array_length(NULLIF(p.target_filters->'languages', 'null'::jsonb)), 0) = 0
               AND COALESCE(jsonb_array_length(NULLIF(p.target_filters->'skills', 'null'::jsonb)), 0) = 0
               AND COALESCE(jsonb_array_length(NULLIF(p.target_filters->'status', 'null'::jsonb)), 0) = 0
               AND COALESCE(jsonb_array_length(NULLIF(p.target_filters->'profession', 'null'::jsonb)), 0) = 0
             )
             OR (u_gender IS NOT NULL AND jsonb_typeof(p.target_filters->'gender') = 'array' AND p.target_filters->'gender' ? u_gender)
             OR (u_languages IS NOT NULL AND jsonb_typeof(p.target_filters->'languages') = 'array' AND EXISTS (
                  SELECT 1 FROM jsonb_array_elements_text(p.target_filters->'languages') l WHERE l = ANY(u_languages)
                ))
             OR (u_skills IS NOT NULL AND jsonb_typeof(p.target_filters->'skills') = 'array' AND EXISTS (
                  SELECT 1 FROM jsonb_array_elements_text(p.target_filters->'skills') s WHERE s = ANY(u_skills)
                ))
             OR (u_status IS NOT NULL AND jsonb_typeof(p.target_filters->'status') = 'array' AND p.target_filters->'status' ? u_status)
             OR (u_profession IS NOT NULL AND jsonb_typeof(p.target_filters->'profession') = 'array' AND p.target_filters->'profession' ? u_profession)
           )
         )
       )
     ORDER BY p.created_at DESC
  ),
  submission_counts AS (
    SELECT t.project_id,
           COUNT(*)::INTEGER AS total_count,
           COUNT(*) FILTER (WHERE t.status = 'approved')::INTEGER AS approved_count
      FROM public.tasks t
     WHERE t.project_id IN (SELECT fp.id FROM filtered_projects fp)
     GROUP BY t.project_id
  )
  SELECT
    fp.id, fp.title, fp.overview, fp.instructions, fp.media_type,
    fp.duration_minutes, fp.duration_label, fp.total_tasks, fp.filled_tasks,
    fp.visible_till, fp.languages, fp.status, fp.created_by, fp.created_at, fp.updated_at,
    fp.pay_per_task, fp.reward_tokens, fp.payment_terms, fp.start_date, fp.end_date,
    fp.dos, fp.donts, fp.sample_media_urls, fp.example_media, fp.project_type,
    fp.max_file_size_mb, fp.visibility_type, fp.target_filters,
    COALESCE(sc.total_count, 0)::INTEGER AS submissions_count,
    COALESCE(sc.approved_count, 0)::INTEGER AS approved_count
  FROM filtered_projects fp
  LEFT JOIN submission_counts sc ON sc.project_id = fp.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_visible_projects_with_counts() TO authenticated, anon;
