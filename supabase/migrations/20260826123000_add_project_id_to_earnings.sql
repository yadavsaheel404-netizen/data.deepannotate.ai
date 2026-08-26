-- Migration: Fix earnings table schema constraints & foreign keys
-- 1. Add project_id column if missing
-- 2. Drop NOT NULL constraint on legacy submission_id column
-- 3. Re-link foreign key constraint earnings_task_id_fkey to public.tasks(id)

ALTER TABLE public.earnings 
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL;

-- Drop legacy NOT NULL constraint on submission_id
ALTER TABLE public.earnings 
  ALTER COLUMN submission_id DROP NOT NULL;

-- Re-create foreign key to current public.tasks table
ALTER TABLE public.earnings DROP CONSTRAINT IF EXISTS earnings_task_id_fkey;

ALTER TABLE public.earnings 
  ADD CONSTRAINT earnings_task_id_fkey 
  FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_earnings_project_id ON public.earnings(project_id);
CREATE INDEX IF NOT EXISTS idx_earnings_task_id ON public.earnings(task_id);

-- Backfill missing columns from tasks
UPDATE public.earnings e
SET project_id = t.project_id,
    submission_id = COALESCE(e.submission_id, e.task_id, t.id)
FROM public.tasks t
WHERE e.task_id = t.id AND (e.project_id IS NULL OR e.submission_id IS NULL);
