-- add_points: canonical credit entry point
CREATE OR REPLACE FUNCTION public.add_points(
  _user_id uuid,
  _amount int,
  _reason public.points_txn_reason,
  _reference_type text DEFAULT NULL,
  _reference_id uuid DEFAULT NULL,
  _counterparty_user_id uuid DEFAULT NULL,
  _metadata jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_id uuid;
BEGIN
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: add_points requires a positive amount';
  END IF;

  INSERT INTO public.points_transactions
    (user_id, amount, type, reason, reference_type, reference_id, counterparty_user_id, metadata)
  VALUES
    (_user_id, _amount, 'credit', _reason, _reference_type, _reference_id, _counterparty_user_id, _metadata)
  ON CONFLICT DO NOTHING
  RETURNING id INTO inserted_id;

  RETURN inserted_id; -- NULL when idempotent insert was skipped
END;
$$;

-- remove_points: canonical debit entry point
CREATE OR REPLACE FUNCTION public.remove_points(
  _user_id uuid,
  _amount int,
  _reason public.points_txn_reason,
  _reference_type text DEFAULT NULL,
  _reference_id uuid DEFAULT NULL,
  _counterparty_user_id uuid DEFAULT NULL,
  _metadata jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_id uuid;
BEGIN
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: remove_points requires a positive amount';
  END IF;

  -- Negative amount expresses the debit; the BEFORE INSERT trigger will
  -- raise INSUFFICIENT_POINTS if the resulting balance would go below zero.
  INSERT INTO public.points_transactions
    (user_id, amount, type, reason, reference_type, reference_id, counterparty_user_id, metadata)
  VALUES
    (_user_id, -_amount, 'debit', _reason, _reference_type, _reference_id, _counterparty_user_id, _metadata)
  RETURNING id INTO inserted_id;

  RETURN inserted_id;
END;
$$;

-- Lock down: anon cannot call; only authenticated + service_role
REVOKE EXECUTE ON FUNCTION public.add_points(uuid, int, public.points_txn_reason, text, uuid, uuid, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.remove_points(uuid, int, public.points_txn_reason, text, uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_points(uuid, int, public.points_txn_reason, text, uuid, uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.remove_points(uuid, int, public.points_txn_reason, text, uuid, uuid, jsonb) TO authenticated, service_role;