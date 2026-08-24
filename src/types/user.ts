export type AppRole = 'admin' | 'contributor';

export interface UserProfile {
  id: string;
  public_user_id: string | null;
  display_name: string | null;
  email: string | null;
  phone: string | null;
  language: string[] | null;
  onboarding_complete: boolean;
  avatar_url: string | null;
  resume_url: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  hours_per_week: string | null;
  profile_completed: boolean;
  skills: string[] | null;
  wallet_balance: number;
  total_earned: number;
  total_paid: number;
  total_tokens: number;
  
  upi_id: string | null;
  account_holder_name: string | null;
  bank_account_number: string | null;
  ifsc_code: string | null;
  country: string | null;
  current_status: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
}
