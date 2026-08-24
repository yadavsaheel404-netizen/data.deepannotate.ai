CREATE OR REPLACE FUNCTION public.admin_list_submissions(
  _status text DEFAULT NULL,
  _project_id uuid DEFAULT NULL,
  _cursor timestamptz DEFAULT NULL,
  _limit int DEFAULT 30,
  _category_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  project_id uuid,
  user_id uuid,
  status text,
  submission_type text,
  text_content text,
  external_url text,
  file_url text,
  notes text,
  created_at timestamptz,
  updated_at timestamptz,
  claimed_by uuid,
  claimed_at timestamptz,
  task_title text,
  task_media_type text,
  task_pay numeric,
  task_start_date timestamptz,
  task_end_date timestamptz,
  contributor_name text,
  selected_category_id uuid,
  selected_category_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'FORBIDDEN: admin only';
  END IF;

  RETURN QUERY
  SELECT
    t.id, t.project_id, t.user_id, t.status::text, t.submission_type,
    t.text_content, t.external_url, t.file_url, t.notes,
    t.created_at, t.updated_at, t.claimed_by, t.claimed_at,
    p.title, p.media_type::text, p.pay_per_task, p.start_date, p.end_date,
    pr.display_name,
    t.selected_category_id,
    pc.category_name
  FROM public.tasks t
  LEFT JOIN public.projects p ON p.id = t.project_id
  LEFT JOIN public.profiles pr ON pr.id = t.user_id
  LEFT JOIN public.project_categories pc ON pc.id = t.selected_category_id
  WHERE (_status IS NULL OR t.status::text = _status)
    AND (_project_id IS NULL OR t.project_id = _project_id)
    AND (_category_id IS NULL OR t.selected_category_id = _category_id)
    AND (_cursor IS NULL OR t.created_at < _cursor)
  ORDER BY t.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(_limit, 30), 100));
END;
$$;