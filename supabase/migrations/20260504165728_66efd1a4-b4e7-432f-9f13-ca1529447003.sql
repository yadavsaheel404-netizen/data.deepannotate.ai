-- Add visibility targeting columns to projects
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS visibility_type text NOT NULL DEFAULT 'everyone',
  ADD COLUMN IF NOT EXISTS target_filters jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Constrain values
DO $$ BEGIN
  ALTER TABLE public.projects
    ADD CONSTRAINT projects_visibility_type_check
    CHECK (visibility_type IN ('everyone','targeted'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_projects_target_filters ON public.projects USING GIN (target_filters);
CREATE INDEX IF NOT EXISTS idx_projects_visibility_type ON public.projects (visibility_type);

-- RPC that returns projects visible to the current user, applying target_filters
CREATE OR REPLACE FUNCTION public.get_visible_projects()
RETURNS SETOF public.projects
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
  SELECT p.*
    FROM public.projects p
   WHERE p.status = 'active'
     AND (
       p.visibility_type = 'everyone'
       OR (
         p.visibility_type = 'targeted'
         AND (
           NOT (p.target_filters ? 'gender')
           OR jsonb_typeof(p.target_filters->'gender') <> 'array'
           OR jsonb_array_length(p.target_filters->'gender') = 0
           OR (u_gender IS NOT NULL AND p.target_filters->'gender' ? u_gender)
         )
         AND (
           NOT (p.target_filters ? 'languages')
           OR jsonb_typeof(p.target_filters->'languages') <> 'array'
           OR jsonb_array_length(p.target_filters->'languages') = 0
           OR (u_languages IS NOT NULL AND EXISTS (
             SELECT 1 FROM jsonb_array_elements_text(p.target_filters->'languages') l
              WHERE l = ANY(u_languages)
           ))
         )
         AND (
           NOT (p.target_filters ? 'skills')
           OR jsonb_typeof(p.target_filters->'skills') <> 'array'
           OR jsonb_array_length(p.target_filters->'skills') = 0
           OR (u_skills IS NOT NULL AND EXISTS (
             SELECT 1 FROM jsonb_array_elements_text(p.target_filters->'skills') s
              WHERE s = ANY(u_skills)
           ))
         )
         AND (
           NOT (p.target_filters ? 'status')
           OR jsonb_typeof(p.target_filters->'status') <> 'array'
           OR jsonb_array_length(p.target_filters->'status') = 0
           OR (u_status IS NOT NULL AND p.target_filters->'status' ? u_status)
         )
         AND (
           NOT (p.target_filters ? 'profession')
           OR jsonb_typeof(p.target_filters->'profession') <> 'array'
           OR jsonb_array_length(p.target_filters->'profession') = 0
           OR (u_profession IS NOT NULL AND p.target_filters->'profession' ? u_profession)
         )
       )
     )
   ORDER BY p.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_visible_projects() TO authenticated, anon;