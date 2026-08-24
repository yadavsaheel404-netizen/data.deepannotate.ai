-- 1. Wallet non-negative constraint
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS wallet_non_negative;
ALTER TABLE public.profiles
  ADD CONSTRAINT wallet_non_negative CHECK (wallet_balance >= 0);

-- 2. Tokens credit idempotency: one credit per task submission
DROP INDEX IF EXISTS public.idx_tokens_txn_idempotent_credit;
DROP INDEX IF EXISTS public.idx_tokens_credit_unique;
CREATE UNIQUE INDEX idx_tokens_credit_unique
  ON public.tokens_transactions (reference_id)
  WHERE type = 'credit' AND reason = 'task_reward' AND reference_id IS NOT NULL;

-- 3. Atomic capacity check in admin status reversal RPC
CREATE OR REPLACE FUNCTION public.update_submission_status_admin(
  _submission_id uuid,
  _new_status text,
  _reason text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  actor uuid := auth.uid();
  sub RECORD;
  proj RECORD;
  task_pay numeric := 0;
  task_tokens int := 0;
  has_paid_payout boolean;
  capacity_claimed uuid;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF NOT public.has_role(actor, 'admin'::app_role) THEN
    RAISE EXCEPTION 'FORBIDDEN: admin only';
  END IF;
  IF _new_status NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'INVALID_STATUS: must be approved or rejected';
  END IF;

  SELECT * INTO sub FROM public.tasks WHERE id = _submission_id FOR UPDATE;
  IF sub IS NULL THEN RAISE EXCEPTION 'SUBMISSION_NOT_FOUND'; END IF;

  IF sub.status::text = _new_status THEN
    RAISE EXCEPTION 'NO_CHANGE: submission already in this status';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.earnings e
    WHERE e.task_id = sub.id AND e.status = 'paid'
  ) INTO has_paid_payout;
  IF has_paid_payout THEN
    RAISE EXCEPTION 'LOCKED: payout already processed for this submission';
  END IF;

  SELECT * INTO proj FROM public.projects WHERE id = sub.project_id;
  task_pay := COALESCE(proj.pay_per_task, 0);
  task_tokens := COALESCE(proj.reward_tokens, 0);

  -- approved -> rejected: reverse earnings and free a task slot atomically
  IF sub.status::text = 'approved' AND _new_status = 'rejected' THEN
    UPDATE public.earnings
       SET status = 'voided'
     WHERE task_id = sub.id AND status <> 'voided';

    UPDATE public.profiles
       SET wallet_balance = GREATEST(wallet_balance - task_pay, 0),
           total_earned   = GREATEST(total_earned - task_pay, 0)
     WHERE id = sub.user_id;

    IF task_tokens > 0 THEN
      PERFORM public.remove_tokens(
        sub.user_id, task_tokens, 'task_reward'::tokens_txn_reason,
        'task_reversal', sub.id, NULL,
        jsonb_build_object('reversal', true, 'project_id', sub.project_id)
      );
    END IF;

  -- rejected -> approved: atomically claim a slot, fail cleanly if full
  ELSIF sub.status::text = 'rejected' AND _new_status = 'approved' THEN
    UPDATE public.projects
       SET filled_tasks = filled_tasks + 1
     WHERE id = sub.project_id
       AND filled_tasks < total_tasks
    RETURNING id INTO capacity_claimed;

    IF capacity_claimed IS NULL THEN
      RAISE EXCEPTION 'PROJECT_FULL: no remaining task slots';
    END IF;

    -- Compensate the trigger-based increment that fires on the tasks UPDATE below,
    -- so we don't double-count the slot.
    UPDATE public.projects
       SET filled_tasks = GREATEST(filled_tasks - 1, 0)
     WHERE id = sub.project_id;

    IF EXISTS (SELECT 1 FROM public.earnings WHERE task_id = sub.id) THEN
      UPDATE public.earnings
         SET status = 'approved', amount = task_pay
       WHERE task_id = sub.id;
    ELSE
      INSERT INTO public.earnings (user_id, project_id, task_id, amount, status)
      VALUES (sub.user_id, sub.project_id, sub.id, task_pay, 'approved');
    END IF;

    UPDATE public.profiles
       SET wallet_balance = wallet_balance + task_pay,
           total_earned   = total_earned + task_pay
     WHERE id = sub.user_id;

    IF task_tokens > 0 THEN
      PERFORM public.add_tokens(
        sub.user_id, task_tokens, 'task_reward'::tokens_txn_reason,
        'task', sub.id, NULL,
        jsonb_build_object('project_id', sub.project_id, 'restored', true)
      );
    END IF;
  ELSE
    RAISE EXCEPTION 'UNSUPPORTED_TRANSITION: % -> %', sub.status, _new_status;
  END IF;

  UPDATE public.tasks
     SET status = _new_status::submission_status,
         notes = COALESCE(_reason, notes),
         updated_at = now()
   WHERE id = _submission_id;

  INSERT INTO public.submission_status_audit
    (submission_id, actor_id, before_status, after_status, reason)
  VALUES (_submission_id, actor, sub.status::text, _new_status, _reason);

  RETURN jsonb_build_object(
    'submission_id', _submission_id,
    'before', sub.status::text,
    'after', _new_status
  );
END;
$function$;