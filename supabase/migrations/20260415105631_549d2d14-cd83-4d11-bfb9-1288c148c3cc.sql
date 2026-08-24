
-- 1. Drop the old trigger that increments on submission insert
DROP TRIGGER IF EXISTS increment_slots_on_submission ON public.submissions;

-- 2. Replace the function to only increment/decrement on approval status changes
CREATE OR REPLACE FUNCTION public.increment_filled_slots()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- On UPDATE: handle status transitions
  IF TG_OP = 'UPDATE' THEN
    -- Approved: increment
    IF OLD.status != 'approved' AND NEW.status = 'approved' THEN
      UPDATE public.tasks SET filled_slots = filled_slots + 1 WHERE id = NEW.task_id;
    END IF;
    -- Un-approved (approved -> something else): decrement
    IF OLD.status = 'approved' AND NEW.status != 'approved' THEN
      UPDATE public.tasks SET filled_slots = GREATEST(filled_slots - 1, 0) WHERE id = NEW.task_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- 3. Create trigger on UPDATE only (not INSERT)
CREATE TRIGGER update_slots_on_approval
AFTER UPDATE ON public.submissions
FOR EACH ROW
EXECUTE FUNCTION public.increment_filled_slots();

-- 4. Recalculate filled_slots for all tasks based on actual approved count
UPDATE public.tasks t
SET filled_slots = (
  SELECT COUNT(*) FROM public.submissions s
  WHERE s.task_id = t.id AND s.status = 'approved'
);

-- 5. Notification trigger: notify all contributors when a new task is published (set to active)
CREATE OR REPLACE FUNCTION public.notify_new_task_published()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.status = 'active')
     OR (TG_OP = 'UPDATE' AND OLD.status != 'active' AND NEW.status = 'active') THEN
    INSERT INTO public.notifications (user_id, title, message, link)
    SELECT ur.user_id,
           'New Task Available 🎯',
           'A new task "' || NEW.title || '" is now available. Check it out!',
           '/app/tasks'
    FROM public.user_roles ur
    WHERE ur.role = 'contributor';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER notify_on_task_publish
AFTER INSERT OR UPDATE ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.notify_new_task_published();

-- 6. Notification trigger: notify when slots are running low (< 10 remaining)
CREATE OR REPLACE FUNCTION public.notify_low_slots()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  remaining int;
  task_row record;
BEGIN
  SELECT * INTO task_row FROM public.tasks WHERE id = NEW.task_id;
  remaining := task_row.total_slots - task_row.filled_slots;
  
  IF remaining > 0 AND remaining <= 10 AND remaining = (task_row.total_slots - task_row.filled_slots) THEN
    -- Only notify if no existing "low slots" notification for this task in the last 24h
    IF NOT EXISTS (
      SELECT 1 FROM public.notifications
      WHERE title LIKE '%Slots Filling Up%'
        AND link = '/app/tasks'
        AND message LIKE '%' || task_row.title || '%'
        AND created_at > now() - interval '24 hours'
      LIMIT 1
    ) THEN
      INSERT INTO public.notifications (user_id, title, message, link)
      SELECT ur.user_id,
             'Slots Filling Up ⚡',
             'Only ' || remaining || ' slots left for "' || task_row.title || '". Hurry!',
             '/app/tasks'
      FROM public.user_roles ur
      WHERE ur.role = 'contributor';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER notify_on_low_slots
AFTER UPDATE ON public.tasks
FOR EACH ROW
WHEN (NEW.filled_slots > OLD.filled_slots)
EXECUTE FUNCTION public.notify_low_slots();
