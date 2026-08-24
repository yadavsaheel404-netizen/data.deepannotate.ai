
CREATE OR REPLACE FUNCTION public.process_earning_on_approval()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  task_pay numeric;
BEGIN
  IF OLD.status = 'in_review' AND NEW.status = 'approved' THEN
    IF NOT EXISTS (SELECT 1 FROM public.earnings WHERE task_id = NEW.id) THEN
      SELECT COALESCE(pay_per_task, 0) INTO task_pay FROM public.projects WHERE id = NEW.project_id;
      INSERT INTO public.earnings (user_id, project_id, task_id, amount, status)
      VALUES (NEW.user_id, NEW.project_id, NEW.id, task_pay, 'approved');
      UPDATE public.profiles
      SET wallet_balance = wallet_balance + task_pay,
          total_earned = total_earned + task_pay
      WHERE id = NEW.user_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_submission_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.status = 'in_review' AND NEW.status IN ('approved', 'rejected') THEN
    INSERT INTO public.notifications (user_id, title, message, link)
    VALUES (
      NEW.user_id,
      CASE NEW.status
        WHEN 'approved' THEN 'Submission Approved ✅'
        WHEN 'rejected' THEN 'Submission Needs Revision ❌'
      END,
      CASE NEW.status
        WHEN 'approved' THEN 'Your submission has been approved! Great work.'
        WHEN 'rejected' THEN 'Your submission was not accepted. Check the feedback and try again.'
      END,
      '/app/submissions'
    );
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.increment_filled_slots()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status != 'approved' AND NEW.status = 'approved' THEN
      UPDATE public.projects SET filled_slots = filled_slots + 1 WHERE id = NEW.project_id;
    END IF;
    IF OLD.status = 'approved' AND NEW.status != 'approved' THEN
      UPDATE public.projects SET filled_slots = GREATEST(filled_slots - 1, 0) WHERE id = NEW.project_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
