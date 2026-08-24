-- ============================================================
-- POINTS WALLET FOUNDATION + PROFILE COMPLETION LOGIC
-- ============================================================

-- 1. SYSTEM SETTINGS (admin-tunable knobs)
CREATE TABLE public.system_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read settings"
  ON public.system_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage settings"
  ON public.system_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.system_settings (key, value) VALUES
  ('profile_completion_points', '500'::jsonb),
  ('tip_min', '10'::jsonb),
  ('tip_max', '1000'::jsonb),
  ('tip_daily_cap', '5000'::jsonb);

-- 2. PROFILE COLUMNS
ALTER TABLE public.profiles
  ADD COLUMN total_points int NOT NULL DEFAULT 0,
  ADD COLUMN profile_points_awarded boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT profiles_total_points_nonneg CHECK (total_points >= 0);

-- 3. POINTS TRANSACTIONS LEDGER (append-only)
CREATE TYPE public.points_txn_type AS ENUM ('credit', 'debit');
CREATE TYPE public.points_txn_reason AS ENUM (
  'profile_complete',
  'profile_incomplete_revoke',
  'task_reward',
  'tip_sent',
  'tip_received',
  'voucher_redeemed',
  'admin_adjustment'
);

CREATE TABLE public.points_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount int NOT NULL,
  type public.points_txn_type NOT NULL,
  reason public.points_txn_reason NOT NULL,
  reference_type text,
  reference_id uuid,
  counterparty_user_id uuid,
  balance_after int NOT NULL DEFAULT 0,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT amount_nonzero CHECK (amount <> 0),
  CONSTRAINT amount_sign_matches_type CHECK (
    (type = 'credit' AND amount > 0) OR (type = 'debit' AND amount < 0)
  )
);

CREATE INDEX idx_points_txn_user_created ON public.points_transactions(user_id, created_at DESC);

-- Idempotency: at most one credit per (user, reason, reference_id) for these reasons
CREATE UNIQUE INDEX idx_points_txn_idempotent_credit
  ON public.points_transactions(user_id, reason, reference_id)
  WHERE reason IN ('profile_complete', 'task_reward', 'voucher_redeemed');

ALTER TABLE public.points_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own points transactions"
  ON public.points_transactions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all points transactions"
  ON public.points_transactions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- No direct INSERT/UPDATE/DELETE policies — ledger is RPC/trigger only.

-- 4. BALANCE MAINTENANCE TRIGGERS
-- BEFORE INSERT: stamp balance_after using current balance + amount
CREATE OR REPLACE FUNCTION public.points_txn_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_balance int;
BEGIN
  SELECT total_points INTO current_balance FROM public.profiles WHERE id = NEW.user_id FOR UPDATE;
  IF current_balance IS NULL THEN
    RAISE EXCEPTION 'Profile not found for user %', NEW.user_id;
  END IF;
  NEW.balance_after := current_balance + NEW.amount;
  IF NEW.balance_after < 0 THEN
    RAISE EXCEPTION 'INSUFFICIENT_POINTS: balance % cannot cover %', current_balance, NEW.amount;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_points_txn_before_insert
  BEFORE INSERT ON public.points_transactions
  FOR EACH ROW EXECUTE FUNCTION public.points_txn_before_insert();

-- AFTER INSERT: apply delta to profiles.total_points
CREATE OR REPLACE FUNCTION public.points_txn_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET total_points = total_points + NEW.amount
  WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_points_txn_after_insert
  AFTER INSERT ON public.points_transactions
  FOR EACH ROW EXECUTE FUNCTION public.points_txn_after_insert();

-- 5. PROFILE COMPLETION CRITERIA EVALUATOR
-- Returns true when all 9 documented criteria are satisfied.
CREATE OR REPLACE FUNCTION public.is_profile_complete(_profile public.profiles)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    COALESCE(btrim(_profile.display_name), '') <> ''
    AND COALESCE(btrim(_profile.phone), '') <> ''
    AND COALESCE(btrim(_profile.avatar_url), '') <> ''
    AND COALESCE(btrim(_profile.resume_url), '') <> ''
    AND COALESCE(btrim(_profile.linkedin_url), '') <> ''
    AND COALESCE(btrim(_profile.hours_per_week), '') <> ''
    AND _profile.language IS NOT NULL AND array_length(_profile.language, 1) >= 1
    AND _profile.skills IS NOT NULL AND array_length(_profile.skills, 1) >= 1
    AND COALESCE(btrim(_profile.upi_id), '') <> '';
$$;

-- 6. SETTINGS HELPER
CREATE OR REPLACE FUNCTION public.get_setting_int(_key text, _default int)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT (value)::text::int FROM public.system_settings WHERE key = _key), _default);
$$;

-- 7. PROFILE COMPLETION TRIGGER
-- Recomputes profile_completed on every UPDATE; on flip true->awards points,
-- on flip false-> revokes (debits) the same amount. Idempotent via
-- profile_points_awarded flag and the unique partial index on the ledger.
CREATE OR REPLACE FUNCTION public.handle_profile_completion_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  was_complete boolean;
  is_complete boolean;
  reward_points int;
BEGIN
  was_complete := COALESCE(OLD.profile_completed, false);
  is_complete := public.is_profile_complete(NEW);

  -- Sync the flag to the computed truth
  NEW.profile_completed := is_complete;

  -- No state change -> nothing to do
  IF was_complete = is_complete THEN
    RETURN NEW;
  END IF;

  reward_points := public.get_setting_int('profile_completion_points', 500);
  IF reward_points <= 0 THEN
    RETURN NEW;
  END IF;

  IF is_complete AND NOT was_complete THEN
    -- Award (only first time, guarded by profile_points_awarded + unique index)
    IF NOT COALESCE(NEW.profile_points_awarded, false) THEN
      INSERT INTO public.points_transactions
        (user_id, amount, type, reason, reference_type, reference_id, metadata)
      VALUES
        (NEW.id, reward_points, 'credit', 'profile_complete', 'profile', NEW.id,
         jsonb_build_object('points', reward_points));
      NEW.profile_points_awarded := true;

      INSERT INTO public.notifications (user_id, title, message, link)
      VALUES (NEW.id, 'Profile Complete 🎉',
              'You earned ' || reward_points || ' points for completing your profile!',
              '/app/wallet');
    END IF;

  ELSIF was_complete AND NOT is_complete THEN
    -- Revoke: debit the same amount, allow flag to be re-armed for future re-award
    IF COALESCE(NEW.profile_points_awarded, false) THEN
      INSERT INTO public.points_transactions
        (user_id, amount, type, reason, reference_type, reference_id, metadata)
      VALUES
        (NEW.id, -reward_points, 'debit', 'profile_incomplete_revoke', 'profile', NEW.id,
         jsonb_build_object('points', reward_points, 'reason', 'profile became incomplete'));
      NEW.profile_points_awarded := false;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profile_completion_change
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_profile_completion_change();

-- Also handle INSERT case (rare: profile created already complete via admin)
CREATE OR REPLACE FUNCTION public.handle_profile_completion_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_complete boolean;
  reward_points int;
BEGIN
  is_complete := public.is_profile_complete(NEW);
  NEW.profile_completed := is_complete;
  IF is_complete THEN
    reward_points := public.get_setting_int('profile_completion_points', 500);
    IF reward_points > 0 AND NOT COALESCE(NEW.profile_points_awarded, false) THEN
      -- Defer ledger write to AFTER INSERT (profile must exist first)
      NEW.profile_points_awarded := true;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profile_completion_insert
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_profile_completion_insert();

CREATE OR REPLACE FUNCTION public.handle_profile_completion_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reward_points int;
BEGIN
  IF NEW.profile_completed AND NEW.profile_points_awarded THEN
    reward_points := public.get_setting_int('profile_completion_points', 500);
    IF reward_points > 0 THEN
      INSERT INTO public.points_transactions
        (user_id, amount, type, reason, reference_type, reference_id, metadata)
      VALUES
        (NEW.id, reward_points, 'credit', 'profile_complete', 'profile', NEW.id,
         jsonb_build_object('points', reward_points))
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profile_completion_after_insert
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_profile_completion_after_insert();

-- 8. BACKFILL: evaluate existing profiles
UPDATE public.profiles SET updated_at = now();
-- The BEFORE UPDATE trigger above will recompute profile_completed and award
-- points (once) for any profile that already meets all 9 criteria.