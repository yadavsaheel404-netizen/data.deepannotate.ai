ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS project_type text NOT NULL DEFAULT 'normal';

ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_project_type_check;

ALTER TABLE public.projects
  ADD CONSTRAINT projects_project_type_check
  CHECK (project_type IN ('normal', 'category'));

CREATE INDEX IF NOT EXISTS idx_projects_project_type ON public.projects(project_type);

UPDATE public.projects SET project_type = 'normal' WHERE project_type IS NULL;