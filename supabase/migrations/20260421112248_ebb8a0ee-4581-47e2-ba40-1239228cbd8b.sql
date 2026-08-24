CREATE OR REPLACE FUNCTION public.enforce_submission_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;