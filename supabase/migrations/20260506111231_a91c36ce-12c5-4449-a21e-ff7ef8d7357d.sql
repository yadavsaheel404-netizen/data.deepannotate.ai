
CREATE TABLE IF NOT EXISTS public.app_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level text NOT NULL CHECK (level IN ('debug','info','warn','error')),
  user_id uuid,
  function_name text NOT NULL,
  error text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_logs_created_at ON public.app_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_logs_level_created ON public.app_logs (level, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_logs_function_created ON public.app_logs (function_name, created_at DESC);

ALTER TABLE public.app_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read app logs"
  ON public.app_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated users can insert own logs"
  ON public.app_logs FOR INSERT TO authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

-- Metrics aggregator over a rolling window
CREATE OR REPLACE FUNCTION public.metrics_summary(_since timestamptz DEFAULT now() - interval '1 hour')
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  submissions_count int;
  approvals_count int;
  payout_failures int;
  api_errors int;
  log_errors int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'FORBIDDEN: admin only';
  END IF;

  SELECT count(*) INTO submissions_count FROM public.tasks WHERE created_at >= _since;

  SELECT count(*) INTO approvals_count
    FROM public.submission_status_audit
   WHERE created_at >= _since AND after_status = 'approved';

  SELECT count(*) INTO payout_failures
    FROM public.withdraw_requests
   WHERE created_at >= _since AND status = 'rejected';

  SELECT count(*) INTO log_errors
    FROM public.app_logs
   WHERE created_at >= _since AND level = 'error';

  api_errors := log_errors;

  RETURN jsonb_build_object(
    'since', _since,
    'submissions_per_window', submissions_count,
    'approvals_per_window', approvals_count,
    'payout_failures', payout_failures,
    'api_errors', api_errors
  );
END;
$$;
