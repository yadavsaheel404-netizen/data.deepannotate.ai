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
           -- If no filters at all, treat as everyone
           (
             COALESCE(jsonb_array_length(NULLIF(p.target_filters->'gender', 'null'::jsonb)), 0) = 0
             AND COALESCE(jsonb_array_length(NULLIF(p.target_filters->'languages', 'null'::jsonb)), 0) = 0
             AND COALESCE(jsonb_array_length(NULLIF(p.target_filters->'skills', 'null'::jsonb)), 0) = 0
             AND COALESCE(jsonb_array_length(NULLIF(p.target_filters->'status', 'null'::jsonb)), 0) = 0
             AND COALESCE(jsonb_array_length(NULLIF(p.target_filters->'profession', 'null'::jsonb)), 0) = 0
           )
           -- OR match ANY category
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
   ORDER BY p.created_at DESC;
END;
$$;