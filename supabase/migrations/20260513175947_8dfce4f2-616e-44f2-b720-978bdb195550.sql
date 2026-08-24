ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS example_media JSONB NOT NULL DEFAULT '[]'::jsonb;
UPDATE storage.buckets SET file_size_limit = 1073741824 WHERE id = 'task-media';