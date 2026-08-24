-- ============================================================
-- 1. Performance indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_tokens_txn_user_created
  ON public.tokens_transactions (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tasks_status_created
  ON public.tasks (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tasks_project_user
  ON public.tasks (project_id, user_id);

CREATE INDEX IF NOT EXISTS idx_earnings_user_created
  ON public.earnings (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_withdraw_status_created
  ON public.withdraw_requests (status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_public_user_id_upper
  ON public.profiles ((upper(public_user_id)));

-- ============================================================
-- 2. Submission claim columns (10-minute admin review lock)
-- ============================================================
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS claimed_by uuid,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_tasks_claimed
  ON public.tasks (claimed_by, claimed_at);

-- Claim a submission for review. Auto-releases stale claims (>10 min).
CREATE OR REPLACE FUNCTION public.claim_submission(_submission_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  actor uuid := auth.uid();
  row_record RECORD;
  expiry interval := interval '10 minutes';
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF NOT public.has_role(actor, 'admin'::app_role) THEN
    RAISE EXCEPTION 'FORBIDDEN: admin only';
  END IF;

  SELECT * INTO row_record FROM public.tasks WHERE id = _submission_id FOR UPDATE;
  IF row_record IS NULL THEN RAISE EXCEPTION 'SUBMISSION_NOT_FOUND'; END IF;

  -- If already claimed by someone else and not expired, block
  IF row_record.claimed_by IS NOT NULL
     AND row_record.claimed_by <> actor
     AND row_record.claimed_at IS NOT NULL
     AND row_record.claimed_at > now() - expiry THEN
    RAISE EXCEPTION 'CLAIMED_BY_OTHER: another admin is reviewing this submission';
  END IF;

  UPDATE public.tasks
     SET claimed_by = actor,
         claimed_at = now()
   WHERE id = _submission_id;

  RETURN jsonb_build_object(
    'submission_id', _submission_id,
    'claimed_by', actor,
    'claimed_at', now(),
    'expires_at', now() + expiry
  );
END;
$$;

-- Release a claim (only the holder or any admin can release)
CREATE OR REPLACE FUNCTION public.release_submission(_submission_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  actor uuid := auth.uid();
  holder uuid;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF NOT public.has_role(actor, 'admin'::app_role) THEN
    RAISE EXCEPTION 'FORBIDDEN: admin only';
  END IF;

  SELECT claimed_by INTO holder FROM public.tasks WHERE id = _submission_id;
  IF holder IS NULL OR holder = actor THEN
    UPDATE public.tasks
       SET claimed_by = NULL, claimed_at = NULL
     WHERE id = _submission_id;
  END IF;
END;
$$;

-- ============================================================
-- 3. Server-side paginated submissions list for admins
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_list_submissions(
  _status text DEFAULT NULL,
  _project_id uuid DEFAULT NULL,
  _cursor timestamptz DEFAULT NULL,
  _limit int DEFAULT 30
)
RETURNS TABLE (
  id uuid,
  project_id uuid,
  user_id uuid,
  status text,
  submission_type text,
  text_content text,
  external_url text,
  file_url text,
  notes text,
  created_at timestamptz,
  updated_at timestamptz,
  claimed_by uuid,
  claimed_at timestamptz,
  task_title text,
  task_media_type text,
  task_pay numeric,
  task_start_date timestamptz,
  task_end_date timestamptz,
  contributor_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'FORBIDDEN: admin only';
  END IF;

  RETURN QUERY
  SELECT
    t.id, t.project_id, t.user_id, t.status::text, t.submission_type,
    t.text_content, t.external_url, t.file_url, t.notes,
    t.created_at, t.updated_at, t.claimed_by, t.claimed_at,
    p.title, p.media_type::text, p.pay_per_task, p.start_date, p.end_date,
    pr.display_name
  FROM public.tasks t
  LEFT JOIN public.projects p ON p.id = t.project_id
  LEFT JOIN public.profiles pr ON pr.id = t.user_id
  WHERE (_status IS NULL OR t.status::text = _status)
    AND (_project_id IS NULL OR t.project_id = _project_id)
    AND (_cursor IS NULL OR t.created_at < _cursor)
  ORDER BY t.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(_limit, 30), 100));
END;
$$;

-- ============================================================
-- 4. Clear claim when status RPC commits a decision
-- ============================================================
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

  -- Block if another admin has an active claim
  IF sub.claimed_by IS NOT NULL
     AND sub.claimed_by <> actor
     AND sub.claimed_at IS NOT NULL
     AND sub.claimed_at > now() - interval '10 minutes' THEN
    RAISE EXCEPTION 'CLAIMED_BY_OTHER: another admin is reviewing this submission';
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

  IF sub.status::text = 'approved' AND _new_status = 'rejected' THEN
    UPDATE public.earnings SET status = 'voided'
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

  ELSIF sub.status::text = 'rejected' AND _new_status = 'approved' THEN
    UPDATE public.projects
       SET filled_tasks = filled_tasks + 1
     WHERE id = sub.project_id
       AND filled_tasks < total_tasks
    RETURNING id INTO capacity_claimed;

    IF capacity_claimed IS NULL THEN
      RAISE EXCEPTION 'PROJECT_FULL: no remaining task slots';
    END IF;

    -- Compensate for the trigger-based increment that fires on the tasks UPDATE below
    UPDATE public.projects
       SET filled_tasks = GREATEST(filled_tasks - 1, 0)
     WHERE id = sub.project_id;

    IF EXISTS (SELECT 1 FROM public.earnings WHERE task_id = sub.id) THEN
      UPDATE public.earnings SET status = 'approved', amount = task_pay
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
         claimed_by = NULL,
         claimed_at = NULL,
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