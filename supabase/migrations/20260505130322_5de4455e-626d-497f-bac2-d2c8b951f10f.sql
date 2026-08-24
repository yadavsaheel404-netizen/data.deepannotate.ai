-- Add link submission support to tasks (submissions) table
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS submission_type text NOT NULL DEFAULT 'file',
  ADD COLUMN IF NOT EXISTS external_url text;

ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_submission_type_check;
ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_submission_type_check
  CHECK (submission_type IN ('file', 'link', 'text'));

-- Ensure at least one of file_url, external_url, or text_content exists
ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_content_present_check;
ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_content_present_check
  CHECK (
    file_url IS NOT NULL
    OR external_url IS NOT NULL
    OR text_content IS NOT NULL
  );