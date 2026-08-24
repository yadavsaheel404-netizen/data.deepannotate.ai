-- Fix recursive trigger conflict on profiles.
-- Problem: BEFORE UPDATE trigger inserted into points_transactions,
-- whose AFTER INSERT trigger UPDATEs the same profiles row currently being modified
-- => "tuple already modified" errors.
--
-- Solution:
--  * BEFORE UPDATE trigger: ONLY computes profile_completed (no side effects).
--  * AFTER UPDATE trigger: handles points awarding/revoking + notifications.
--    (Safe because the original profiles UPDATE has already written its tuple.)
--  * Points awarding is idempotent (guarded by profile_points_awarded flag).

-- 1. Strip side effects from the BEFORE UPDATE trigger
CREATE OR REPLACE FUNCTION public.handle_profile_completion_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Only compute the completion flag in-place (no extra UPDATE, no inserts).
  NEW.profile_completed := public.is_profile_complete(NEW);
  RETURN NEW;
END;
$function$;

-- 2. New AFTER UPDATE function: awards/revokes points safely outside the row mutation.
CREATE OR REPLACE FUNCTION public.handle_profile_completion_after_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  reward_points int;
BEGIN
  -- Only act on actual completion-state transitions
  IF COALESCE(OLD.profile_completed, false) = COALESCE(NEW.profile_completed, false) THEN
    RETURN NULL;
  END IF;

  reward_points := public.get_setting_int('profile_completion_points', 500);
  IF reward_points <= 0 THEN
    RETURN NULL;
  END IF;

  -- Transition: incomplete -> complete  => award (idempotent via profile_points_awarded)
  IF NEW.profile_completed AND NOT COALESCE(OLD.profile_completed, false) THEN
    IF NOT COALESCE(NEW.profile_points_awarded, false) THEN
      INSERT INTO public.points_transactions
        (user_id, amount, type, reason, reference_type, reference_id, metadata)
      VALUES
        (NEW.id, reward_points, 'credit', 'profile_complete', 'profile', NEW.id,
         jsonb_build_object('points', reward_points));

      -- Separate, scoped UPDATE; safe at AFTER time. Won't recurse meaningfully:
      -- the BEFORE trigger just recomputes profile_completed (unchanged), and
      -- this AFTER trigger early-returns because completion state didn't change.
      UPDATE public.profiles
      SET profile_points_awarded = true
      WHERE id = NEW.id AND profile_points_awarded = false;

      INSERT INTO public.notifications (user_id, title, message, link)
      VALUES (NEW.id, 'Profile Complete 🎉',
              'You earned ' || reward_points || ' points for completing your profile!',
              '/app/wallet');
    END IF;

  -- Transition: complete -> incomplete  => revoke
  ELSIF NOT NEW.profile_completed AND COALESCE(OLD.profile_completed, false) THEN
    IF COALESCE(NEW.profile_points_awarded, false) THEN
      INSERT INTO public.points_transactions
        (user_id, amount, type, reason, reference_type, reference_id, metadata)
      VALUES
        (NEW.id, -reward_points, 'debit', 'profile_incomplete_revoke', 'profile', NEW.id,
         jsonb_build_object('points', reward_points, 'reason', 'profile became incomplete'));

      UPDATE public.profiles
      SET profile_points_awarded = false
      WHERE id = NEW.id AND profile_points_awarded = true;
    END IF;
  END IF;

  RETURN NULL;
END;
$function$;

-- 3. Wire up the AFTER UPDATE trigger (replace any prior version)
DROP TRIGGER IF EXISTS trg_profile_completion_after_update ON public.profiles;
CREATE TRIGGER trg_profile_completion_after_update
AFTER UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.handle_profile_completion_after_update();
