
-- Fix notify_low_slots: NEW is a tasks row, use NEW.id not NEW.task_id
CREATE OR REPLACE FUNCTION public.notify_low_slots()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
$function$;
