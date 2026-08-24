-- Recompute completion directly from required fields for every profile write.
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

-- Profile completion points are based only on real field-state transitions.
-- OLD and NEW are recomputed from profile fields instead of trusting stored flags.
CREATE OR REPLACE FUNCTION public.handle_profile_completion_after_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  reward_points int;
  was_complete boolean := public.is_profile_complete(OLD);
  is_complete boolean := public.is_profile_complete(NEW);
BEGIN
  IF was_complete = is_complete THEN
    RETURN NULL;
  END IF;

  reward_points := public.get_setting_int('profile_completion_points', 500);
  IF reward_points <= 0 THEN
    RETURN NULL;
  END IF;

  IF is_complete AND NOT was_complete THEN
    INSERT INTO public.points_transactions
      (user_id, amount, type, reason, reference_type, reference_id, metadata)
    VALUES
      (NEW.id, reward_points, 'credit', 'profile_complete', 'profile_transition', gen_random_uuid(),
       jsonb_build_object('points', reward_points, 'transition', 'incomplete_to_complete'));

    INSERT INTO public.notifications (user_id, title, message, link)
    VALUES (NEW.id, 'Profile Complete 🎉',
            'You earned ' || reward_points || ' points for completing your profile!',
            '/app/wallet');
  ELSIF was_complete AND NOT is_complete THEN
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

-- Same recomputed-field logic for profiles that are inserted already complete.
CREATE OR REPLACE FUNCTION public.handle_profile_completion_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  reward_points int;
BEGIN
  IF NOT public.is_profile_complete(NEW) THEN
    RETURN NULL;
  END IF;

  reward_points := public.get_setting_int('profile_completion_points', 500);
  IF reward_points <= 0 THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.points_transactions
    (user_id, amount, type, reason, reference_type, reference_id, metadata)
  VALUES
    (NEW.id, reward_points, 'credit', 'profile_complete', 'profile_transition', gen_random_uuid(),
     jsonb_build_object('points', reward_points, 'transition', 'insert_complete'));

  INSERT INTO public.notifications (user_id, title, message, link)
  VALUES (NEW.id, 'Profile Complete 🎉',
          'You earned ' || reward_points || ' points for completing your profile!',
          '/app/wallet');

  RETURN NULL;
END;
$function$;

-- Idempotent helper: completed profiles should have exactly one active net
-- profile reward. Running this repeatedly will not duplicate points.
CREATE OR REPLACE FUNCTION public.reconcile_profile_completion_points(_user_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(user_id uuid, delta integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  reward_points int := public.get_setting_int('profile_completion_points', 500);
  row_record RECORD;
  net_profile_points int;
  adjustment int;
BEGIN
  IF reward_points <= 0 THEN
    RETURN;
  END IF;

  FOR row_record IN
    SELECT p.*
    FROM public.profiles p
    WHERE (_user_id IS NULL OR p.id = _user_id)
      AND public.is_profile_complete(p)
  LOOP
    SELECT COALESCE(SUM(pt.amount), 0)
      INTO net_profile_points
    FROM public.points_transactions pt
    WHERE pt.user_id = row_record.id
      AND pt.reason IN ('profile_complete', 'profile_incomplete_revoke');

    adjustment := reward_points - COALESCE(net_profile_points, 0);

    IF adjustment > 0 THEN
      INSERT INTO public.points_transactions
        (user_id, amount, type, reason, reference_type, reference_id, metadata)
      VALUES
        (row_record.id, adjustment, 'credit', 'profile_complete', 'profile_reconciliation', gen_random_uuid(),
         jsonb_build_object('points', adjustment, 'source', 'profile_completion_reconciliation'));

      INSERT INTO public.notifications (user_id, title, message, link)
      VALUES (row_record.id, 'Profile Points Restored',
              'You earned ' || adjustment || ' points for your completed profile.',
              '/app/wallet');

      user_id := row_record.id;
      delta := adjustment;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$function$;

-- Ledger repair helper: cached balances are reset from the transaction ledger.
CREATE OR REPLACE FUNCTION public.recalculate_points_balances(_user_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(user_id uuid, total_points integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH ledger AS (
    SELECT p.id, COALESCE(SUM(pt.amount), 0)::int AS ledger_total
    FROM public.profiles p
    LEFT JOIN public.points_transactions pt ON pt.user_id = p.id
    WHERE (_user_id IS NULL OR p.id = _user_id)
    GROUP BY p.id
  )
  UPDATE public.profiles p
     SET total_points = ledger.ledger_total
    FROM ledger
   WHERE p.id = ledger.id
     AND p.total_points IS DISTINCT FROM ledger.ledger_total
  RETURNING p.id, p.total_points;
END;
$function$;

DROP TRIGGER IF EXISTS trg_profile_completion_insert ON public.profiles;
DROP TRIGGER IF EXISTS trg_profile_completion_change ON public.profiles;
DROP TRIGGER IF EXISTS trg_profile_completion_after_insert ON public.profiles;
DROP TRIGGER IF EXISTS trg_profile_completion_after_update ON public.profiles;

CREATE TRIGGER trg_profile_completion_insert
BEFORE INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.handle_profile_completion_insert();

CREATE TRIGGER trg_profile_completion_change
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.handle_profile_completion_change();

CREATE TRIGGER trg_profile_completion_after_insert
AFTER INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.handle_profile_completion_after_insert();

CREATE TRIGGER trg_profile_completion_after_update
AFTER UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.handle_profile_completion_after_update();