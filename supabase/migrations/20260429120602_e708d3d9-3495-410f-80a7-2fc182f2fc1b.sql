-- 1. Make profile-completion award idempotent at the row level too,
--    so a rare race between two concurrent profile UPDATEs cannot abort
--    the user's transaction with a unique-violation.
CREATE OR REPLACE FUNCTION public.handle_profile_completion_after_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  reward_points int;
  inserted_id uuid;
BEGIN
  IF COALESCE(OLD.profile_completed, false) = COALESCE(NEW.profile_completed, false) THEN
    RETURN NULL;
  END IF;

  reward_points := public.get_setting_int('profile_completion_points', 500);
  IF reward_points <= 0 THEN
    RETURN NULL;
  END IF;

  IF NEW.profile_completed AND NOT COALESCE(OLD.profile_completed, false) THEN
    IF NOT COALESCE(NEW.profile_points_awarded, false) THEN
      INSERT INTO public.points_transactions
        (user_id, amount, type, reason, reference_type, reference_id, metadata)
      VALUES
        (NEW.id, reward_points, 'credit', 'profile_complete', 'profile', NEW.id,
         jsonb_build_object('points', reward_points))
      ON CONFLICT DO NOTHING
      RETURNING id INTO inserted_id;

      UPDATE public.profiles
      SET profile_points_awarded = true
      WHERE id = NEW.id AND profile_points_awarded = false;

      -- Only notify when we actually wrote a fresh ledger row
      IF inserted_id IS NOT NULL THEN
        INSERT INTO public.notifications (user_id, title, message, link)
        VALUES (NEW.id, 'Profile Complete 🎉',
                'You earned ' || reward_points || ' points for completing your profile!',
                '/app/wallet');
      END IF;
    END IF;

  ELSIF NOT NEW.profile_completed AND COALESCE(OLD.profile_completed, false) THEN
    IF COALESCE(NEW.profile_points_awarded, false) THEN
      INSERT INTO public.points_transactions
        (user_id, amount, type, reason, reference_type, reference_id, metadata)
      VALUES
        (NEW.id, -reward_points, 'debit', 'profile_incomplete_revoke', 'profile', NEW.id,
         jsonb_build_object('points', reward_points, 'reason', 'profile became incomplete'));

      UPDATE public.profiles
      SET profile_points_awarded = false
      WHERE id = NEW.id AND profile_points_awarded = true;
    END IF;
  END IF;

  RETURN NULL;
END;
$function$;

-- 2. send_tip with optional client idempotency key
CREATE OR REPLACE FUNCTION public.send_tip(
  _recipient_id uuid,
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
  sender_id uuid := auth.uid();
  recipient_active boolean;
  daily_total int;
  daily_cap int;
  min_tip int;
  max_tip int;
  debit_id uuid;
  credit_id uuid;
  existing RECORD;
  meta jsonb;
BEGIN
  IF sender_id IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF _recipient_id IS NULL THEN RAISE EXCEPTION 'INVALID_RECIPIENT: recipient is required'; END IF;
  IF _recipient_id = sender_id THEN RAISE EXCEPTION 'SELF_TIP_NOT_ALLOWED: you cannot tip yourself'; END IF;

  -- Idempotent replay: if same sender already tipped with this key, return the original result
  IF _idempotency_key IS NOT NULL AND btrim(_idempotency_key) <> '' THEN
    SELECT id, amount, counterparty_user_id, metadata
      INTO existing
      FROM public.points_transactions
     WHERE user_id = sender_id
       AND reason = 'tip_sent'
       AND metadata->>'idempotency_key' = _idempotency_key
     LIMIT 1;
    IF existing.id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'debit_id', existing.id,
        'amount', -existing.amount,
        'recipient_id', existing.counterparty_user_id,
        'replayed', true
      );
    END IF;
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

  SELECT is_active INTO recipient_active FROM public.profiles WHERE id = _recipient_id;
  IF recipient_active IS NULL THEN RAISE EXCEPTION 'RECIPIENT_NOT_FOUND: no user with that ID'; END IF;
  IF recipient_active = false THEN RAISE EXCEPTION 'RECIPIENT_INACTIVE: recipient account is not active'; END IF;

  SELECT COALESCE(SUM(-amount), 0) INTO daily_total
    FROM public.points_transactions
   WHERE user_id = sender_id AND reason = 'tip_sent'
     AND created_at >= date_trunc('day', now());
  IF daily_total + _amount > daily_cap THEN
    RAISE EXCEPTION 'DAILY_CAP_EXCEEDED: daily tip limit of % points reached', daily_cap;
  END IF;

  meta := jsonb_build_object(
    'note', _note,
    'sender_id', sender_id,
    'recipient_id', _recipient_id,
    'idempotency_key', _idempotency_key
  );

  INSERT INTO public.points_transactions
    (user_id, amount, type, reason, reference_type, counterparty_user_id, metadata)
  VALUES
    (sender_id, -_amount, 'debit', 'tip_sent', 'tip', _recipient_id, meta)
  RETURNING id INTO debit_id;

  INSERT INTO public.points_transactions
    (user_id, amount, type, reason, reference_type, reference_id, counterparty_user_id, metadata)
  VALUES
    (_recipient_id, _amount, 'credit', 'tip_received', 'tip', debit_id, sender_id, meta)
  RETURNING id INTO credit_id;

  INSERT INTO public.notifications (user_id, title, message, link)
  VALUES (_recipient_id, 'You received a tip 🎁',
          'Someone sent you ' || _amount || ' points!', '/app/wallet');

  RETURN jsonb_build_object(
    'debit_id', debit_id,
    'credit_id', credit_id,
    'amount', _amount,
    'recipient_id', _recipient_id,
    'replayed', false
  );
END;
$function$;

-- 3. redeem_voucher with optional client idempotency key
CREATE OR REPLACE FUNCTION public.redeem_voucher(
  _voucher_id uuid,
  _idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  v RECORD;
  code_row RECORD;
  redemption_id uuid;
  txn_id uuid;
  existing RECORD;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;

  -- Idempotent replay: same user + voucher + key returns prior redemption
  IF _idempotency_key IS NOT NULL AND btrim(_idempotency_key) <> '' THEN
    SELECT vr.id, vr.code_snapshot, vr.voucher_title_snapshot,
           vr.voucher_value_inr_snapshot, vr.points_spent
      INTO existing
      FROM public.voucher_redemptions vr
      JOIN public.points_transactions pt ON pt.id = vr.points_txn_id
     WHERE vr.user_id = uid
       AND vr.voucher_id = _voucher_id
       AND pt.metadata->>'idempotency_key' = _idempotency_key
     LIMIT 1;
    IF existing.id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'redemption_id', existing.id,
        'code', existing.code_snapshot,
        'voucher_title', existing.voucher_title_snapshot,
        'value_inr', existing.voucher_value_inr_snapshot,
        'points_spent', existing.points_spent,
        'replayed', true
      );
    END IF;
  END IF;

  SELECT * INTO v FROM public.vouchers WHERE id = _voucher_id FOR SHARE;
  IF v IS NULL THEN RAISE EXCEPTION 'VOUCHER_NOT_FOUND'; END IF;
  IF v.is_active = false THEN RAISE EXCEPTION 'VOUCHER_INACTIVE'; END IF;

  SELECT * INTO code_row
    FROM public.voucher_codes
   WHERE voucher_id = _voucher_id AND assigned_to IS NULL
   ORDER BY created_at
   FOR UPDATE SKIP LOCKED
   LIMIT 1;
  IF code_row IS NULL THEN RAISE EXCEPTION 'OUT_OF_STOCK: no codes available for this voucher'; END IF;

  redemption_id := gen_random_uuid();

  INSERT INTO public.points_transactions
    (user_id, amount, type, reason, reference_type, reference_id, metadata)
  VALUES
    (uid, -v.points_cost, 'debit', 'voucher_redeemed', 'voucher_redemption', redemption_id,
     jsonb_build_object('voucher_id', v.id, 'brand', v.brand, 'value_inr', v.value_inr,
                        'idempotency_key', _idempotency_key))
  RETURNING id INTO txn_id;

  INSERT INTO public.voucher_redemptions
    (id, user_id, voucher_id, voucher_code_id, code_snapshot, points_spent,
     voucher_title_snapshot, voucher_brand_snapshot, voucher_value_inr_snapshot,
     status, points_txn_id)
  VALUES
    (redemption_id, uid, v.id, code_row.id, code_row.code, v.points_cost,
     v.title, v.brand, v.value_inr, 'fulfilled', txn_id);

  UPDATE public.voucher_codes
     SET assigned_to = uid, assigned_at = now(), redemption_id = redemption_id
   WHERE id = code_row.id;

  INSERT INTO public.notifications (user_id, title, message, link)
  VALUES (uid, 'Voucher Redeemed 🎉',
          'Your ' || v.title || ' is ready. Check your wallet.', '/app/wallet');

  RETURN jsonb_build_object(
    'redemption_id', redemption_id,
    'code', code_row.code,
    'voucher_title', v.title,
    'value_inr', v.value_inr,
    'points_spent', v.points_cost,
    'replayed', false
  );
END;
$function$;

-- Index to make idempotency-key lookups fast
CREATE INDEX IF NOT EXISTS idx_points_txn_idem_key
  ON public.points_transactions ((metadata->>'idempotency_key'))
  WHERE metadata ? 'idempotency_key';
