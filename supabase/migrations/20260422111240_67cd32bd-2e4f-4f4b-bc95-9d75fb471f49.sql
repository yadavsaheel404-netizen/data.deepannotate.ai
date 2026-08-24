
CREATE OR REPLACE FUNCTION public.enforce_user_submission_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  user_count int;
  max_slots int;
BEGIN
  SELECT total_slots INTO max_slots FROM public.projects WHERE id = NEW.project_id;
  IF max_slots IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO user_count
  FROM public.tasks
  WHERE user_id = NEW.user_id AND project_id = NEW.project_id;

  IF user_count >= max_slots THEN
    RAISE EXCEPTION 'SUBMISSION_LIMIT_REACHED' USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_user_submission_limit_trigger ON public.tasks;
CREATE TRIGGER enforce_user_submission_limit_trigger
BEFORE INSERT ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.enforce_user_submission_limit();
