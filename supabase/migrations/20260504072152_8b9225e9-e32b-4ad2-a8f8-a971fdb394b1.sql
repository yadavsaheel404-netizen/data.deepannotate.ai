-- Add flexible duration_label field to projects (keep duration_minutes for backward compatibility)
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS duration_label TEXT;

-- Backfill existing rows: convert numeric duration_minutes to "X mins"
UPDATE public.projects
SET duration_label = duration_minutes::text || ' mins'
WHERE duration_label IS NULL;

-- Make duration_minutes nullable so new flexible-format tasks don't require it
ALTER TABLE public.projects
  ALTER COLUMN duration_minutes DROP NOT NULL;