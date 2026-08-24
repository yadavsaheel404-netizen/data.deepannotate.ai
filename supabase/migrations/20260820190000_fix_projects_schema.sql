-- 1. Ensure all columns expected by get_visible_projects_with_counts() exist on public.projects
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS overview TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS instructions TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS media_type TEXT DEFAULT 'video';
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS duration_minutes INTEGER DEFAULT 0;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS duration_label TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS total_tasks INTEGER DEFAULT 0;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS filled_tasks INTEGER DEFAULT 0;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS visible_till TIMESTAMPTZ;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS languages TEXT[] DEFAULT '{en}'::TEXT[];
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS pay_per_task NUMERIC DEFAULT 0;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS reward_tokens INTEGER DEFAULT 0;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS payment_terms TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS start_date TIMESTAMPTZ;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS end_date TIMESTAMPTZ;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS dos TEXT[];
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS donts TEXT[];
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS sample_media_urls TEXT[];
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS example_media JSONB;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS project_type TEXT DEFAULT 'annotation';
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS max_file_size_mb INTEGER DEFAULT 50;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS visibility_type TEXT DEFAULT 'everyone';
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS target_filters JSONB DEFAULT '{}'::JSONB;

-- 2. Fix PostgreSQL 42702 ambiguous column reference inside get_visible_projects_with_counts()
-- Qualifying `public.profiles.id = uid` prevents PL/pgSQL from confusing the profile table ID
-- with the implicit `id UUID` output column parameter in RETURNS TABLE.
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
      WHERE public.profiles.id = uid;
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
