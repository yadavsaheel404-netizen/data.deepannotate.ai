-- Add Guidelines hub integration fields to public.projects
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS platform_url TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS referral_code TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS discord_url TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS community_url TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS guidelines_doc_url TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS has_guidelines_hub BOOLEAN DEFAULT false;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS short_description TEXT;
