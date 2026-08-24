
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS dos text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS donts text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS sample_media_urls text[] NOT NULL DEFAULT '{}';
