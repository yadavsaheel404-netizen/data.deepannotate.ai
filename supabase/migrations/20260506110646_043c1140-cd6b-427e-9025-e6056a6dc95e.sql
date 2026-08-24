
-- 1) Job queue table
CREATE TABLE IF NOT EXISTS public.notification_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  message text NOT NULL,
  link text,
  audience text NOT NULL DEFAULT 'contributors', -- contributors | all | user_ids
  user_ids uuid[],
  status text NOT NULL DEFAULT 'pending', -- pending | processing | done | failed
  total_recipients int NOT NULL DEFAULT 0,
  processed_recipients int NOT NULL DEFAULT 0,
  last_processed_user_id uuid,
  error text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_notification_jobs_status_created
  ON public.notification_jobs (status, created_at);

ALTER TABLE public.notification_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage notification jobs"
  ON public.notification_jobs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 2) Enqueue helper (callable by SECURITY DEFINER trigger functions)
CREATE OR REPLACE FUNCTION public.enqueue_notification_job(
  _title text,
  _message text,
  _link text,
  _audience text DEFAULT 'contributors',
  _user_ids uuid[] DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  job_id uuid;
  total int := 0;
BEGIN
  IF _audience = 'contributors' THEN
    SELECT count(*) INTO total FROM public.user_roles WHERE role = 'contributor';
  ELSIF _audience = 'all' THEN
    SELECT count(*) INTO total FROM public.profiles;
  ELSIF _audience = 'user_ids' THEN
    total := COALESCE(array_length(_user_ids, 1), 0);
  END IF;

  INSERT INTO public.notification_jobs (title, message, link, audience, user_ids, total_recipients, created_by)
  VALUES (_title, _message, _link, _audience, _user_ids, total, auth.uid())
  RETURNING id INTO job_id;

  RETURN job_id;
END;
$$;

-- 3) Batch processor — runs one batch of 500 against the oldest pending/processing job
CREATE OR REPLACE FUNCTION public.process_notification_jobs_batch(_batch_size int DEFAULT 500)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  job RECORD;
  inserted_count int := 0;
  cursor_id uuid;
BEGIN
  -- Pick oldest job that still needs work
  SELECT * INTO job
  FROM public.notification_jobs
  WHERE status IN ('pending', 'processing')
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF job IS NULL THEN
    RETURN jsonb_build_object('processed', 0, 'job_id', NULL);
  END IF;

  IF job.status = 'pending' THEN
    UPDATE public.notification_jobs
       SET status = 'processing', started_at = now()
     WHERE id = job.id;
  END IF;

  cursor_id := job.last_processed_user_id;

  IF job.audience = 'contributors' THEN
    WITH page AS (
      SELECT ur.user_id
        FROM public.user_roles ur
       WHERE ur.role = 'contributor'
         AND (cursor_id IS NULL OR ur.user_id > cursor_id)
       ORDER BY ur.user_id ASC
       LIMIT _batch_size
    ), ins AS (
      INSERT INTO public.notifications (user_id, title, message, link)
      SELECT user_id, job.title, job.message, job.link FROM page
      RETURNING user_id
    )
    SELECT count(*), max(user_id) INTO inserted_count, cursor_id FROM ins;

  ELSIF job.audience = 'all' THEN
    WITH page AS (
      SELECT id AS user_id FROM public.profiles
       WHERE (cursor_id IS NULL OR id > cursor_id)
       ORDER BY id ASC LIMIT _batch_size
    ), ins AS (
      INSERT INTO public.notifications (user_id, title, message, link)
      SELECT user_id, job.title, job.message, job.link FROM page
      RETURNING user_id
    )
    SELECT count(*), max(user_id) INTO inserted_count, cursor_id FROM ins;

  ELSIF job.audience = 'user_ids' THEN
    WITH page AS (
      SELECT u AS user_id
        FROM unnest(job.user_ids) AS u
       WHERE (cursor_id IS NULL OR u > cursor_id)
       ORDER BY u ASC LIMIT _batch_size
    ), ins AS (
      INSERT INTO public.notifications (user_id, title, message, link)
      SELECT user_id, job.title, job.message, job.link FROM page
      RETURNING user_id
    )
    SELECT count(*), max(user_id) INTO inserted_count, cursor_id FROM ins;
  END IF;

  IF inserted_count = 0 THEN
    UPDATE public.notification_jobs
       SET status = 'done', completed_at = now()
     WHERE id = job.id;
  ELSE
    UPDATE public.notification_jobs
       SET processed_recipients = processed_recipients + inserted_count,
           last_processed_user_id = cursor_id
     WHERE id = job.id;
  END IF;

  RETURN jsonb_build_object(
    'job_id', job.id,
    'processed', inserted_count,
    'cursor', cursor_id,
    'total', job.total_recipients
  );
END;
$$;

-- 4) Replace fan-out triggers to enqueue jobs
CREATE OR REPLACE FUNCTION public.notify_new_task_published()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.status = 'active')
     OR (TG_OP = 'UPDATE' AND OLD.status != 'active' AND NEW.status = 'active') THEN
    PERFORM public.enqueue_notification_job(
      'New Task Available 🎯',
      'A new task "' || NEW.title || '" is now available. Check it out!',
      '/app/tasks',
      'contributors',
      NULL
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_low_slots()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  remaining int;
BEGIN
  remaining := NEW.total_tasks - NEW.filled_tasks;
  IF remaining > 0 AND remaining <= 10 THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.notification_jobs
      WHERE title LIKE '%Filling Up%'
        AND message LIKE '%' || NEW.title || '%'
        AND created_at > now() - interval '24 hours'
      LIMIT 1
    ) THEN
      PERFORM public.enqueue_notification_job(
        'Tasks Filling Up ⚡',
        'Only ' || remaining || ' tasks left for "' || NEW.title || '". Hurry!',
        '/app/tasks',
        'contributors',
        NULL
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
