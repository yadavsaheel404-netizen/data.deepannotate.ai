export interface ClientProject {
  id: string;
  slug: string;
  name: string;
  short_description: string | null;
  status: 'active' | 'upcoming' | 'closed';
  icon: string | null;
  platform_url: string | null;
  referral_code: string | null;
  discord_url: string | null;
  community_url: string | null;
  guidelines_doc_url: string | null;
  created_at?: string;
}

export const DEFAULT_CLIENT_PROJECTS: ClientProject[] = [
  {
    id: 'vla-default-id',
    slug: 'vla',
    name: 'VLA — Vision-Language-Action',
    short_description: 'Onboarding, quality calibration, and studio access for the VLA multimodal annotation project.',
    status: 'active',
    icon: 'Layers',
    platform_url: null,
    referral_code: null,
    discord_url: null,
    community_url: null,
    guidelines_doc_url: null,
  },
];
