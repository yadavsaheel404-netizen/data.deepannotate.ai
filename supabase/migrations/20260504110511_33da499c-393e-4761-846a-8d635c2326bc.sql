ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS payout_country text,
  ADD COLUMN IF NOT EXISTS paypal_email text;