CREATE TABLE IF NOT EXISTS public.project_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  category_name text NOT NULL,
  welcome_message text,
  category_overview text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_categories_project_id
  ON public.project_categories(project_id, sort_order);

ALTER TABLE public.project_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage project categories" ON public.project_categories;
CREATE POLICY "Admins can manage project categories"
  ON public.project_categories
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Contributors can view categories of active projects" ON public.project_categories;
CREATE POLICY "Contributors can view categories of active projects"
  ON public.project_categories
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_categories.project_id
        AND p.status = 'active'
        AND public.is_user_active(auth.uid())
    )
  );

CREATE TRIGGER update_project_categories_updated_at
  BEFORE UPDATE ON public.project_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();