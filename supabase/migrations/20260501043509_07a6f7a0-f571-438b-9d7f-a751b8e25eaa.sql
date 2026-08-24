
-- Tipping by public_user_id (DF-XXXXXX) instead of UUID

CREATE OR REPLACE FUNCTION public.send_tip_by_public_id(
  _recipient_public_id text,
  _amount integer,
  _note text DEFAULT NULL,
  _idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  resolved_id uuid;
  cleaned text;
BEGIN
  IF _recipient_public_id IS NULL OR btrim(_recipient_public_id) = '' THEN
    RAISE EXCEPTION 'INVALID_RECIPIENT: recipient is required';
  END IF;

  cleaned := upper(btrim(_recipient_public_id));

  SELECT id INTO resolved_id
  FROM public.profiles
  WHERE upper(public_user_id) = cleaned
  LIMIT 1;

  IF resolved_id IS NULL THEN
    RAISE EXCEPTION 'RECIPIENT_NOT_FOUND: no user with that ID';
  END IF;

  -- Delegate to the existing send_tip RPC (UUID + idempotency overload)
  RETURN public.send_tip(resolved_id, _amount, _note, _idempotency_key);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.send_tip_by_public_id(text, integer, text, text) TO authenticated;
