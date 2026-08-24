CREATE OR REPLACE FUNCTION public.admin_category_analytics(
  _project_id uuid,
  _from timestamptz DEFAULT NULL,
  _to timestamptz DEFAULT NULL
)
RETURNS TABLE (
  category_id uuid,
  category_name text,
  total bigint,
  approved bigint,
  rejected bigint,
  pending bigint,
  rejection_rate numeric,
  completion_rate numeric
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
  WITH cats AS (
    SELECT id, category_name, sort_order
    FROM public.project_categories
    WHERE project_id = _project_id
  ),
  agg AS (
    SELECT
      t.selected_category_id AS cid,
      COUNT(*)::bigint AS total,
      COUNT(*) FILTER (WHERE t.status = 'approved')::bigint AS approved,
      COUNT(*) FILTER (WHERE t.status = 'rejected')::bigint AS rejected,
      COUNT(*) FILTER (WHERE t.status = 'in_review')::bigint AS pending
    FROM public.tasks t
    WHERE t.project_id = _project_id
      AND t.selected_category_id IS NOT NULL
      AND (_from IS NULL OR t.created_at >= _from)
      AND (_to IS NULL OR t.created_at <= _to)
    GROUP BY t.selected_category_id
  )
  SELECT
    c.id,
    c.category_name,
    COALESCE(a.total, 0),
    COALESCE(a.approved, 0),
    COALESCE(a.rejected, 0),
    COALESCE(a.pending, 0),
    CASE
      WHEN COALESCE(a.approved, 0) + COALESCE(a.rejected, 0) > 0
      THEN ROUND((a.rejected::numeric / (a.approved + a.rejected)::numeric) * 100, 1)
      ELSE 0
    END AS rejection_rate,
    CASE
      WHEN COALESCE(a.total, 0) > 0
      THEN ROUND((a.approved::numeric / a.total::numeric) * 100, 1)
      ELSE 0
    END AS completion_rate
  FROM cats c
  LEFT JOIN agg a ON a.cid = c.id
  ORDER BY c.sort_order, c.category_name;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_tasks_project_category
  ON public.tasks (project_id, selected_category_id)
  WHERE selected_category_id IS NOT NULL;