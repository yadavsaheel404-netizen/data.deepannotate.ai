-- 1. Drop bonus_amount, add reward_points
ALTER TABLE public.projects DROP COLUMN IF EXISTS bonus_amount;
ALTER TABLE public.projects
  ADD COLUMN reward_points int NOT NULL DEFAULT 0,
  ADD CONSTRAINT projects_reward_points_nonneg CHECK (reward_points >= 0);

-- 2. Extend approval trigger to also credit points.
-- The unique partial index on points_transactions(user_id, reason, reference_id)
-- WHERE reason IN ('profile_complete','task_reward','voucher_redeemed')
-- guarantees re-approval cannot duplicate the credit.
CREATE OR REPLACE FUNCTION public.process_earning_on_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  task_pay numeric;
  task_points int;
BEGIN
  IF OLD.status = 'in_review' AND NEW.status = 'approved' THEN
    SELECT COALESCE(pay_per_task, 0), COALESCE(reward_points, 0)
      INTO task_pay, task_points
    FROM public.projects WHERE id = NEW.project_id;

    -- Rupee earning (unchanged behavior, still guarded by NOT EXISTS)
    IF NOT EXISTS (SELECT 1 FROM public.earnings WHERE task_id = NEW.id) THEN
      INSERT INTO public.earnings (user_id, project_id, task_id, amount, status)
      VALUES (NEW.user_id, NEW.project_id, NEW.id, task_pay, 'approved');
      UPDATE public.profiles
      SET wallet_balance = wallet_balance + task_pay,
          total_earned = total_earned + task_pay
      WHERE id = NEW.user_id;
    END IF;

    -- Points reward (idempotent via unique partial index on the ledger)
    IF task_points > 0 THEN
      INSERT INTO public.points_transactions
        (user_id, amount, type, reason, reference_type, reference_id, metadata)
      VALUES
        (NEW.user_id, task_points, 'credit', 'task_reward', 'task', NEW.id,
         jsonb_build_object('points', task_points, 'project_id', NEW.project_id))
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;