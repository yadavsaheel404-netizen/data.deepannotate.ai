-- Tipping system: send points from one user to another atomically
-- Constraints from product spec:
--   * Min 10 / Max 1000 points per tip
--   * Sender must have sufficient balance (enforced by points_txn_before_insert)
--   * Daily cap per sender: 5000 points/day
--   * Cannot tip yourself
--   * Recipient must be a valid, active profile

CREATE OR REPLACE FUNCTION public.send_tip(
  _recipient_id uuid,
  _amount int,
  _note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sender_id uuid := auth.uid();
  recipient_active boolean;
  daily_total int;
  daily_cap int;
  min_tip int;
  max_tip int;
  debit_id uuid;
  credit_id uuid;
  meta jsonb;
BEGIN
  IF sender_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  IF _recipient_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_RECIPIENT: recipient is required';
  END IF;

  IF _recipient_id = sender_id THEN
    RAISE EXCEPTION 'SELF_TIP_NOT_ALLOWED: you cannot tip yourself';
  END IF;

  min_tip := public.get_setting_int('tip_min_amount', 10);
  max_tip := public.get_setting_int('tip_max_amount', 1000);
  daily_cap := public.get_setting_int('tip_daily_cap', 5000);

  IF _amount IS NULL OR _amount < min_tip THEN
    RAISE EXCEPTION 'AMOUNT_TOO_LOW: minimum tip is % points', min_tip;
  END IF;

  IF _amount > max_tip THEN
    RAISE EXCEPTION 'AMOUNT_TOO_HIGH: maximum tip is % points', max_tip;
  END IF;

  -- Validate recipient exists and is active
  SELECT is_active INTO recipient_active
  FROM public.profiles WHERE id = _recipient_id;

  IF recipient_active IS NULL THEN
    RAISE EXCEPTION 'RECIPIENT_NOT_FOUND: no user with that ID';
  END IF;

  IF recipient_active = false THEN
    RAISE EXCEPTION 'RECIPIENT_INACTIVE: recipient account is not active';
  END IF;

  -- Daily cap enforcement (sum of tip_sent debits today, as positive)
  SELECT COALESCE(SUM(-amount), 0) INTO daily_total
  FROM public.points_transactions
  WHERE user_id = sender_id
    AND reason = 'tip_sent'
    AND created_at >= date_trunc('day', now());

  IF daily_total + _amount > daily_cap THEN
    RAISE EXCEPTION 'DAILY_CAP_EXCEEDED: daily tip limit of % points reached', daily_cap;
  END IF;

  meta := jsonb_build_object(
    'note', _note,
    'sender_id', sender_id,
    'recipient_id', _recipient_id
  );

  -- Debit sender first — BEFORE INSERT trigger raises INSUFFICIENT_POINTS if balance too low
  INSERT INTO public.points_transactions
    (user_id, amount, type, reason, reference_type, counterparty_user_id, metadata)
  VALUES
    (sender_id, -_amount, 'debit', 'tip_sent', 'tip', _recipient_id, meta)
  RETURNING id INTO debit_id;

  -- Credit recipient — link via reference_id to the debit row for traceability
  INSERT INTO public.points_transactions
    (user_id, amount, type, reason, reference_type, reference_id, counterparty_user_id, metadata)
  VALUES
    (_recipient_id, _amount, 'credit', 'tip_received', 'tip', debit_id, sender_id, meta)
  RETURNING id INTO credit_id;

  -- Notify recipient
  INSERT INTO public.notifications (user_id, title, message, link)
  VALUES (
    _recipient_id,
    'You received a tip 🎁',
    'Someone sent you ' || _amount || ' points!',
    '/app/wallet'
  );

  RETURN jsonb_build_object(
    'debit_id', debit_id,
    'credit_id', credit_id,
    'amount', _amount,
    'recipient_id', _recipient_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.send_tip(uuid, int, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_tip(uuid, int, text) TO authenticated, service_role;

-- Seed tip settings (idempotent)
INSERT INTO public.system_settings (key, value) VALUES
  ('tip_min_amount', '10'::jsonb),
  ('tip_max_amount', '1000'::jsonb),
  ('tip_daily_cap', '5000'::jsonb)
ON CONFLICT (key) DO NOTHING;