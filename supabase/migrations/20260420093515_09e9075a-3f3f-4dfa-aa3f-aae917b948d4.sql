
-- Update default for tasks.status to 'in_review'
ALTER TABLE public.tasks ALTER COLUMN status SET DEFAULT 'in_review'::submission_status;

-- Update RLS policy: contributors can update their own in_review submissions
DROP POLICY IF EXISTS "Contributors can update own pending submissions" ON public.tasks;
CREATE POLICY "Contributors can update own in_review submissions"
ON public.tasks
FOR UPDATE
TO authenticated
USING ((auth.uid() = user_id) AND (status = 'in_review'::submission_status))
WITH CHECK ((auth.uid() = user_id) AND (status = 'in_review'::submission_status));

-- Update process_earning_on_approval trigger function to use in_review
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
    IF NOT EXISTS (SELECT 1 FROM public.earnings WHERE submission_id = NEW.id) THEN
      SELECT COALESCE(pay_per_task, 0) INTO task_pay FROM public.tasks WHERE id = NEW.task_id;
      INSERT INTO public.earnings (user_id, task_id, submission_id, amount, status)
      VALUES (NEW.contributor_id, NEW.task_id, NEW.id, task_pay, 'approved');
      UPDATE public.profiles
      SET wallet_balance = wallet_balance + task_pay,
          total_earned = total_earned + task_pay
      WHERE id = NEW.contributor_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- Update notify_submission_status_change trigger function to use in_review
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
      NEW.contributor_id,
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
