-- Rename slot columns to task columns on projects table
ALTER TABLE public.projects RENAME COLUMN total_slots TO total_tasks;
ALTER TABLE public.projects RENAME COLUMN filled_slots TO filled_tasks;

-- Recreate dependent functions to use new column names

CREATE OR REPLACE FUNCTION public.enforce_submission_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  project_record RECORD;
BEGIN
  SELECT status, total_tasks, filled_tasks, end_date
    INTO project_record
  FROM public.projects
  WHERE id = NEW.project_id;

  IF project_record IS NULL THEN
    RAISE EXCEPTION 'Project does not exist';
  END IF;

  IF project_record.status != 'active' THEN
    RAISE EXCEPTION 'Project is not accepting submissions';
  END IF;

  IF project_record.filled_tasks >= project_record.total_tasks THEN
    RAISE EXCEPTION 'Project is full — no tasks remaining';
  END IF;

  IF project_record.end_date IS NOT NULL AND project_record.end_date < now() THEN
    RAISE EXCEPTION 'Project deadline has passed';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_low_slots()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  remaining int;
BEGIN
  remaining := NEW.total_tasks - NEW.filled_tasks;

  IF remaining > 0 AND remaining <= 10 THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.notifications
      WHERE title LIKE '%Filling Up%'
        AND link = '/app/tasks'
        AND message LIKE '%' || NEW.title || '%'
        AND created_at > now() - interval '24 hours'
      LIMIT 1
    ) THEN
      INSERT INTO public.notifications (user_id, title, message, link)
      SELECT ur.user_id,
             'Tasks Filling Up ⚡',
             'Only ' || remaining || ' tasks left for "' || NEW.title || '". Hurry!',
             '/app/tasks'
      FROM public.user_roles ur
      WHERE ur.role = 'contributor';
    END IF;
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
      UPDATE public.projects SET filled_tasks = filled_tasks + 1 WHERE id = NEW.project_id;
    END IF;
    IF OLD.status = 'approved' AND NEW.status != 'approved' THEN
      UPDATE public.projects SET filled_tasks = GREATEST(filled_tasks - 1, 0) WHERE id = NEW.project_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_user_submission_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  user_count int;
  max_tasks int;
BEGIN
  SELECT total_tasks INTO max_tasks FROM public.projects WHERE id = NEW.project_id;
  IF max_tasks IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO user_count
  FROM public.tasks
  WHERE user_id = NEW.user_id AND project_id = NEW.project_id;

  IF user_count >= max_tasks THEN
    RAISE EXCEPTION 'SUBMISSION_LIMIT_REACHED' USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;