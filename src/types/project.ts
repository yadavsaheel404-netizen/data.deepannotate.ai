export type MediaType = 'text' | 'audio' | 'image' | 'video';
export type TaskStatus = 'draft' | 'active' | 'paused' | 'completed';
export type PaymentTerms = 'on_completion' | 'weekly' | 'monthly';

export interface ExampleMediaItem {
  id: string;
  kind: 'good' | 'bad';
  source: 'upload' | 'link';
  media_type: 'image' | 'video' | 'audio' | 'link';
  url: string;
  title: string;
  note: string;
}

export interface Task {
  id: string;
  title: string;
  overview?: string | null;
  instructions: string;
  media_type: MediaType;
  duration_minutes: number | null;
  duration_label?: string | null;
  total_tasks: number;
  filled_tasks: number;
  visible_till: string | null;
  languages: string[];
  status: TaskStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  pay_per_task: number;
  reward_tokens: number;
  payment_terms: PaymentTerms;
  start_date: string | null;
  end_date: string | null;
  dos: string[];
  donts: string[];
  sample_media_urls: string[];
  example_media?: ExampleMediaItem[] | null;
  project_type?: 'normal' | 'category';
  max_file_size_mb?: number | null;
  submissions_count?: number;
  approved_count?: number;
  visibility_type?: 'everyone' | 'targeted';
  target_filters?: {
    gender?: string[];
    languages?: string[];
    skills?: string[];
    status?: string[];
    profession?: string[];
  } | null;
  slug?: string | null;
  platform_url?: string | null;
  referral_code?: string | null;
  discord_url?: string | null;
  community_url?: string | null;
  guidelines_doc_url?: string | null;
  has_guidelines_hub?: boolean;
  short_description?: string | null;
}

export type TaskInsert = Omit<Task, 'id' | 'created_at' | 'updated_at' | 'filled_tasks'> & {
  id?: string;
};
