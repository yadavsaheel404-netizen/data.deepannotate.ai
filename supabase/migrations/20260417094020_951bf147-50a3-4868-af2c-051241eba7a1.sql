-- Block new submissions when task slots are full or task is closed
CREATE OR REPLACE FUNCTION public.enforce_submission_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  task_record RECORD;
BEGIN
  SELECT status, total_slots, filled_slots, end_date
    INTO task_record
  FROM public.tasks
  WHERE id = NEW.task_id;

  IF task_record IS NULL THEN
    RAISE EXCEPTION 'Task does not exist';
  END IF;

  IF task_record.status != 'active' THEN
    RAISE EXCEPTION 'Task is not accepting submissions';
  END IF;

  IF task_record.filled_slots >= task_record.total_slots THEN
    RAISE EXCEPTION 'Task is full — no slots remaining';
  END IF;

  IF task_record.end_date IS NOT NULL AND task_record.end_date < now() THEN
    RAISE EXCEPTION 'Task deadline has passed';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS enforce_submission_rules_trigger ON public.submissions;
CREATE TRIGGER enforce_submission_rules_trigger
  BEFORE INSERT ON public.submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_submission_rules();

-- Block multiple pending withdrawal requests per user
CREATE OR REPLACE FUNCTION public.enforce_single_pending_withdrawal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'pending' AND EXISTS (
    SELECT 1 FROM public.withdraw_requests
    WHERE user_id = NEW.user_id
      AND status IN ('pending', 'approved')
      AND id != NEW.id
  ) THEN
    RAISE EXCEPTION 'You already have an active withdrawal request being processed';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS enforce_single_pending_withdrawal_trigger ON public.withdraw_requests;
CREATE TRIGGER enforce_single_pending_withdrawal_trigger
  BEFORE INSERT ON public.withdraw_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_single_pending_withdrawal();