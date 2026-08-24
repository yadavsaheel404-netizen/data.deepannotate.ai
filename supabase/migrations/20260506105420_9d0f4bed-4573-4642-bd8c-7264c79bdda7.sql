-- 1. Audit log table
CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  before jsonb,
  after jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON public.audit_log (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON public.audit_log (actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON public.audit_log (created_at DESC);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read audit log" ON public.audit_log;
CREATE POLICY "Admins can read audit log"
  ON public.audit_log
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- No direct inserts/updates/deletes from clients; triggers (SECURITY DEFINER) write entries.

-- 2. Generic trigger writer
CREATE OR REPLACE FUNCTION public.write_audit_log(
  _action text,
  _entity_type text,
  _entity_id uuid,
  _before jsonb,
  _after jsonb
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, before, after)
  VALUES (auth.uid(), _action, _entity_type, _entity_id, _before, _after);
$$;

-- 3. Submission status changes
CREATE OR REPLACE FUNCTION public.audit_submission_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.write_audit_log(
      'submission_status_changed',
      'tasks',
      NEW.id,
      jsonb_build_object('status', OLD.status, 'notes', OLD.notes),
      jsonb_build_object('status', NEW.status, 'notes', NEW.notes)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_submission_status ON public.tasks;
CREATE TRIGGER trg_audit_submission_status
  AFTER UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.audit_submission_status();

-- 4. Wallet adjustments on profiles
CREATE OR REPLACE FUNCTION public.audit_wallet_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
       OLD.wallet_balance IS DISTINCT FROM NEW.wallet_balance
    OR OLD.total_earned   IS DISTINCT FROM NEW.total_earned
    OR OLD.total_paid     IS DISTINCT FROM NEW.total_paid
  ) THEN
    PERFORM public.write_audit_log(
      'wallet_adjusted',
      'profiles',
      NEW.id,
      jsonb_build_object(
        'wallet_balance', OLD.wallet_balance,
        'total_earned',   OLD.total_earned,
        'total_paid',     OLD.total_paid
      ),
      jsonb_build_object(
        'wallet_balance', NEW.wallet_balance,
        'total_earned',   NEW.total_earned,
        'total_paid',     NEW.total_paid
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_wallet_changes ON public.profiles;
CREATE TRIGGER trg_audit_wallet_changes
  AFTER UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.audit_wallet_changes();

-- 5. Payout / withdrawal status changes
CREATE OR REPLACE FUNCTION public.audit_withdraw_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_audit_log(
      'payout_requested',
      'withdraw_requests',
      NEW.id,
      NULL,
      jsonb_build_object('status', NEW.status, 'amount', NEW.amount, 'user_id', NEW.user_id)
    );
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.write_audit_log(
      'payout_status_changed',
      'withdraw_requests',
      NEW.id,
      jsonb_build_object('status', OLD.status, 'amount', OLD.amount, 'rejection_reason', OLD.rejection_reason),
      jsonb_build_object('status', NEW.status, 'amount', NEW.amount, 'rejection_reason', NEW.rejection_reason)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_withdraw_changes ON public.withdraw_requests;
CREATE TRIGGER trg_audit_withdraw_changes
  AFTER INSERT OR UPDATE ON public.withdraw_requests
  FOR EACH ROW EXECUTE FUNCTION public.audit_withdraw_changes();

-- 6. Role changes
CREATE OR REPLACE FUNCTION public.audit_role_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_audit_log(
      'role_granted', 'user_roles', NEW.user_id,
      NULL,
      jsonb_build_object('role', NEW.role)
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' AND OLD.role IS DISTINCT FROM NEW.role THEN
    PERFORM public.write_audit_log(
      'role_changed', 'user_roles', NEW.user_id,
      jsonb_build_object('role', OLD.role),
      jsonb_build_object('role', NEW.role)
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.write_audit_log(
      'role_revoked', 'user_roles', OLD.user_id,
      jsonb_build_object('role', OLD.role),
      NULL
    );
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_role_changes ON public.user_roles;
CREATE TRIGGER trg_audit_role_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.audit_role_changes();