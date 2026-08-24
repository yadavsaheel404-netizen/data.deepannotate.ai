CREATE OR REPLACE FUNCTION public.get_points_balance(_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  IF auth.uid() <> _user_id AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  RETURN (
    SELECT COALESCE(SUM(amount), 0)::int
    FROM public.points_transactions
    WHERE user_id = _user_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_points_balance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_points_balance(uuid) TO authenticated;