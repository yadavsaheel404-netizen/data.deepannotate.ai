-- 1. Replace the idempotency unique index so it no longer covers
--    'profile_complete' (we now allow repeated awards across transitions).
DROP INDEX IF EXISTS public.idx_points_txn_idempotent_credit;
CREATE UNIQUE INDEX idx_points_txn_idempotent_credit
  ON public.points_transactions (user_id, reason, reference_id)
  WHERE reason IN ('task_reward', 'voucher_redeemed');

-- 2. BEFORE INSERT: just compute completion flag, no flag bookkeeping.
CREATE OR REPLACE FUNCTION public.handle_profile_completion_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.profile_completed := public.is_profile_complete(NEW);
  RETURN NEW;
END;
$function$;

-- 3. AFTER INSERT: if the brand-new profile is already complete, award once.
CREATE OR REPLACE FUNCTION public.handle_profile_completion_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  reward_points int;
BEGIN
  IF NEW.profile_completed THEN
    reward_points := public.get_setting_int('profile_completion_points', 500);
    IF reward_points > 0 THEN
      INSERT INTO public.points_transactions
        (user_id, amount, type, reason, reference_type, reference_id, metadata)
      VALUES
        (NEW.id, reward_points, 'credit', 'profile_complete', 'profile_transition', gen_random_uuid(),
         jsonb_build_object('points', reward_points, 'transition', 'incomplete_to_complete'));

      INSERT INTO public.notifications (user_id, title, message, link)
      VALUES (NEW.id, 'Profile Complete 🎉',
              'You earned ' || reward_points || ' points for completing your profile!',
              '/app/wallet');
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- 4. BEFORE UPDATE: only recompute the completion flag. No ledger writes.
--    (Already correct from previous migration — re-asserted for clarity.)
CREATE OR REPLACE FUNCTION public.handle_profile_completion_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.profile_completed := public.is_profile_complete(NEW);
  RETURN NEW;
END;
$function$;

-- 5. AFTER UPDATE: pure state-transition logic. No flag, no idempotency check.
--    Re-award is allowed; only acts when the boolean actually flipped.
CREATE OR REPLACE FUNCTION public.handle_profile_completion_after_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  reward_points int;
  was_complete boolean := COALESCE(OLD.profile_completed, false);
  is_complete  boolean := COALESCE(NEW.profile_completed, false);
BEGIN
  -- No transition -> nothing to do (this is what prevents duplicate awards
  -- on repeated saves where state doesn't change).
  IF was_complete = is_complete THEN
    RETURN NULL;
  END IF;

  reward_points := public.get_setting_int('profile_completion_points', 500);
  IF reward_points <= 0 THEN
    RETURN NULL;
  END IF;

  IF is_complete AND NOT was_complete THEN
    -- incomplete -> complete : credit
    INSERT INTO public.points_transactions
      (user_id, amount, type, reason, reference_type, reference_id, metadata)
    VALUES
      (NEW.id, reward_points, 'credit', 'profile_complete', 'profile_transition', gen_random_uuid(),
       jsonb_build_object('points', reward_points, 'transition', 'incomplete_to_complete'));

    INSERT INTO public.notifications (user_id, title, message, link)
    VALUES (NEW.id, 'Profile Complete 🎉',
            'You earned ' || reward_points || ' points for completing your profile!',
            '/app/wallet');

  ELSE
    -- complete -> incomplete : debit
    INSERT INTO public.points_transactions
      (user_id, amount, type, reason, reference_type, reference_id, metadata)
    VALUES
      (NEW.id, -reward_points, 'debit', 'profile_incomplete_revoke', 'profile_transition', gen_random_uuid(),
       jsonb_build_object('points', reward_points, 'transition', 'complete_to_incomplete'));

    INSERT INTO public.notifications (user_id, title, message, link)
    VALUES (NEW.id, 'Profile Incomplete',
            reward_points || ' points were removed because your profile is no longer complete.',
            '/app/profile');
  END IF;

  RETURN NULL;
END;
$function$;

-- 6. Drop the legacy flag column. The ledger is now the source of truth.
ALTER TABLE public.profiles DROP COLUMN IF EXISTS profile_points_awarded;
