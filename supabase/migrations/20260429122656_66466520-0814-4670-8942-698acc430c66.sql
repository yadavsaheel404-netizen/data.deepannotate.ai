CREATE OR REPLACE FUNCTION public.get_points_balance(_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(SUM(amount), 0)::int
  FROM public.points_transactions
  WHERE user_id = _user_id;
$function$;

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
  net_profile_points int;
  adjustment int;
BEGIN
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

    RETURN NULL;
  END IF;

  IF was_complete AND NOT is_complete THEN
    INSERT INTO public.points_transactions
      (user_id, amount, type, reason, reference_type, reference_id, metadata)
    VALUES
      (NEW.id, -reward_points, 'debit', 'profile_incomplete_revoke', 'profile_transition', gen_random_uuid(),
       jsonb_build_object('points', reward_points, 'transition', 'complete_to_incomplete'));

    INSERT INTO public.notifications (user_id, title, message, link)
    VALUES (NEW.id, 'Profile Incomplete',
            reward_points || ' points were removed because your profile is no longer complete.',
            '/app/profile');

    RETURN NULL;
  END IF;

  -- Reconciliation exception: no new points on unchanged state unless a
  -- completed profile is missing its active net completion reward.
  IF is_complete THEN
    SELECT COALESCE(SUM(pt.amount), 0)::int
      INTO net_profile_points
    FROM public.points_transactions pt
    WHERE pt.user_id = NEW.id
      AND pt.reason IN ('profile_complete', 'profile_incomplete_revoke');

    adjustment := reward_points - COALESCE(net_profile_points, 0);

    IF adjustment > 0 THEN
      INSERT INTO public.points_transactions
        (user_id, amount, type, reason, reference_type, reference_id, metadata)
      VALUES
        (NEW.id, adjustment, 'credit', 'profile_complete', 'profile_reconciliation', gen_random_uuid(),
         jsonb_build_object('points', adjustment, 'source', 'profile_completion_reconciliation'));

      INSERT INTO public.notifications (user_id, title, message, link)
      VALUES (NEW.id, 'Profile Points Restored',
              'You earned ' || adjustment || ' points for your completed profile.',
              '/app/wallet');
    END IF;
  END IF;

  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.reconcile_profile_completion_points(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recalculate_points_balances(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_points_balance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_points_balance(uuid) TO authenticated;