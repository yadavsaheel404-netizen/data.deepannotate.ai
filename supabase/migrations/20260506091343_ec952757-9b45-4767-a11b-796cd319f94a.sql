-- Audit log for admin status changes on submissions
CREATE TABLE IF NOT EXISTS public.submission_status_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  before_status text NOT NULL,
  after_status text NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.submission_status_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view audit log"
  ON public.submission_status_audit FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_submission_status_audit_submission
  ON public.submission_status_audit(submission_id);

-- RPC: admin changes submission status (approved <-> rejected) atomically
CREATE OR REPLACE FUNCTION public.update_submission_status_admin(
  _submission_id uuid,
  _new_status text,
  _reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  sub RECORD;
  proj RECORD;
  task_pay numeric := 0;
  task_tokens int := 0;
  has_paid_payout boolean;
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

  -- Lock if related earning has been paid out
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

  -- CASE: approved -> rejected (reverse earnings)
  IF sub.status::text = 'approved' AND _new_status = 'rejected' THEN
    -- Void earning(s) for this task
    UPDATE public.earnings
       SET status = 'voided'
     WHERE task_id = sub.id AND status <> 'voided';

    -- Reduce wallet/total_earned (clamp wallet at 0)
    UPDATE public.profiles
       SET wallet_balance = GREATEST(wallet_balance - task_pay, 0),
           total_earned   = GREATEST(total_earned - task_pay, 0)
     WHERE id = sub.user_id;

    -- Reverse token reward
    IF task_tokens > 0 THEN
      PERFORM public.remove_tokens(
        sub.user_id, task_tokens, 'task_reward'::tokens_txn_reason,
        'task_reversal', sub.id, NULL,
        jsonb_build_object('reversal', true, 'project_id', sub.project_id)
      );
    END IF;

  -- CASE: rejected -> approved (credit user)
  ELSIF sub.status::text = 'rejected' AND _new_status = 'approved' THEN
    -- Block if project is full
    IF proj.filled_tasks >= proj.total_tasks THEN
      RAISE EXCEPTION 'PROJECT_FULL: no remaining task slots';
    END IF;

    -- Create or revive earning entry
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

  -- Update submission status (triggers handle filled_tasks + notification)
  UPDATE public.tasks
     SET status = _new_status::submission_status,
         notes = COALESCE(_reason, notes),
         updated_at = now()
   WHERE id = _submission_id;

  -- Audit log
  INSERT INTO public.submission_status_audit
    (submission_id, actor_id, before_status, after_status, reason)
  VALUES (_submission_id, actor, sub.status::text, _new_status, _reason);

  RETURN jsonb_build_object(
    'submission_id', _submission_id,
    'before', sub.status::text,
    'after', _new_status
  );
END;
$$;