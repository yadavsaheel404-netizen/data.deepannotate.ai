-- Add file_hash column to tasks (submissions) table for duplicate detection
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS file_hash text;

-- Prevent the same user from submitting the same content for the same project
CREATE UNIQUE INDEX IF NOT EXISTS tasks_user_project_file_hash_unique
  ON public.tasks (user_id, project_id, file_hash)
  WHERE file_hash IS NOT NULL;

-- Prevent the same user from submitting the same file_url for the same project
CREATE UNIQUE INDEX IF NOT EXISTS tasks_user_project_file_url_unique
  ON public.tasks (user_id, project_id, file_url)
  WHERE file_url IS NOT NULL;