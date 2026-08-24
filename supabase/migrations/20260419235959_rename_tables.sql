-- 1. Rename enum value to include 'in_review'
ALTER TYPE public.submission_status ADD VALUE IF NOT EXISTS 'in_review';

-- 2. Rename tables
ALTER TABLE public.tasks RENAME TO projects;
ALTER TABLE public.submissions RENAME TO tasks;

-- 3. Rename columns on new tasks table (old submissions)
ALTER TABLE public.tasks RENAME COLUMN task_id TO project_id;
ALTER TABLE public.tasks RENAME COLUMN contributor_id TO user_id;

-- 4. Recreate dependent functions to use new table and column names

-- increment_filled_slots
CREATE OR REPLACE FUNCTION public.increment_filled_slots()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
$$;

-- notify_low_slots
CREATE OR REPLACE FUNCTION public.notify_low_slots()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  remaining int;
BEGIN
  remaining := NEW.total_slots - NEW.filled_slots;
  IF remaining > 0 AND remaining <= 10 THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.notifications
      WHERE title LIKE '%Slots Filling Up%'
        AND link = '/app/tasks'
        AND message LIKE '%' || NEW.title || '%'
        AND created_at > now() - interval '24 hours'
      LIMIT 1
    ) THEN
      INSERT INTO public.notifications (user_id, title, message, link)
      SELECT ur.user_id,
             'Slots Filling Up ⚡',
             'Only ' || remaining || ' slots left for "' || NEW.title || '". Hurry!',
             '/app/tasks'
      FROM public.user_roles ur
      WHERE ur.role = 'contributor';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- enforce_submission_rules
CREATE OR REPLACE FUNCTION public.enforce_submission_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  project_record RECORD;
BEGIN
  SELECT status, total_slots, filled_slots, end_date
    INTO project_record
  FROM public.projects
  WHERE id = NEW.project_id;

  IF project_record IS NULL THEN
    RAISE EXCEPTION 'Project does not exist';
  END IF;

  IF project_record.status != 'active' THEN
    RAISE EXCEPTION 'Project is not accepting submissions';
  END IF;

  IF project_record.filled_slots >= project_record.total_slots THEN
    RAISE EXCEPTION 'Project is full — no slots remaining';
  END IF;

  IF project_record.end_date IS NOT NULL AND project_record.end_date < now() THEN
    RAISE EXCEPTION 'Project deadline has passed';
  END IF;

  RETURN NEW;
END;
$$;

-- notify_submission_status_change
CREATE OR REPLACE FUNCTION public.notify_submission_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.status = 'pending' AND NEW.status IN ('approved', 'rejected') THEN
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
$$;

-- process_earning_on_approval
CREATE OR REPLACE FUNCTION public.process_earning_on_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  task_pay numeric;
BEGIN
  IF OLD.status = 'pending' AND NEW.status = 'approved' THEN
    IF NOT EXISTS (SELECT 1 FROM public.earnings WHERE submission_id = NEW.id) THEN
      SELECT COALESCE(pay_per_task, 0) INTO task_pay FROM public.projects WHERE id = NEW.project_id;
      INSERT INTO public.earnings (user_id, task_id, submission_id, amount, status)
      VALUES (NEW.user_id, NEW.project_id, NEW.id, task_pay, 'approved');
      UPDATE public.profiles
      SET wallet_balance = wallet_balance + task_pay,
          total_earned = total_earned + task_pay
      WHERE id = NEW.user_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
