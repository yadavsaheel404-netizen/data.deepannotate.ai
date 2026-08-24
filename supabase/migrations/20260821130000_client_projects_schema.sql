-- Create public.client_projects table for multi-project guidelines hub
CREATE TABLE IF NOT EXISTS public.client_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  short_description TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'upcoming', 'closed')),
  icon TEXT,
  platform_url TEXT,
  referral_code TEXT,
  discord_url TEXT,
  community_url TEXT,
  guidelines_doc_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS and add public SELECT policy
ALTER TABLE public.client_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view client projects" ON public.client_projects;
CREATE POLICY "Anyone can view client projects"
  ON public.client_projects FOR SELECT
  TO authenticated, anon
  USING (TRUE);

-- Seed VLA project row
INSERT INTO public.client_projects (slug, name, short_description, status)
VALUES (
  'vla',
  'VLA — Vision-Language-Action',
  'Onboarding, quality calibration, and studio access for the VLA multimodal annotation project.',
  'active'
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  short_description = EXCLUDED.short_description,
  status = EXCLUDED.status;
