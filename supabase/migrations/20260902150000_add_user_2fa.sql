-- Add two_factor_enabled column to public.profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS two_factor_enabled boolean NOT NULL DEFAULT false;

-- user_2fa: stores TOTP secrets and backup codes, service-role only
CREATE TABLE IF NOT EXISTS public.user_2fa (
  user_id       uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  secret        text NOT NULL,
  enabled       boolean NOT NULL DEFAULT false,
  backup_codes  text[] NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS with zero policies -> zero client access, service-role / Edge Function only
ALTER TABLE public.user_2fa ENABLE ROW LEVEL SECURITY;

-- failed_2fa_attempts: rate limiting log (append-only)
CREATE TABLE IF NOT EXISTS public.failed_2fa_attempts (
  id         bigserial PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  attempt_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS with zero policies -> service-role only
ALTER TABLE public.failed_2fa_attempts ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_failed_2fa_attempts_user_time ON public.failed_2fa_attempts (user_id, attempt_at DESC);
