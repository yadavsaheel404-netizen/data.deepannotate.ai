
-- =====================================================================
-- 1. Drop triggers that reference the functions we'll rename (so we can
--    drop the old functions cleanly). The functions themselves will be
--    recreated with new names, then the triggers re-created.
-- =====================================================================
DROP TRIGGER IF EXISTS trg_points_txn_before_insert ON public.points_transactions;
DROP TRIGGER IF EXISTS trg_points_txn_after_insert ON public.points_transactions;

-- Profile completion triggers (call handle_profile_completion_after_*)
DROP TRIGGER IF EXISTS handle_profile_completion_after_insert_trg ON public.profiles;
DROP TRIGGER IF EXISTS handle_profile_completion_after_update_trg ON public.profiles;
DROP TRIGGER IF EXISTS trg_handle_profile_completion_after_insert ON public.profiles;
DROP TRIGGER IF EXISTS trg_handle_profile_completion_after_update ON public.profiles;

-- =====================================================================
-- 2. Rename enum TYPES (values stay the same).
-- =====================================================================
ALTER TYPE public.points_txn_type   RENAME TO tokens_txn_type;
ALTER TYPE public.points_txn_reason RENAME TO tokens_txn_reason;

-- =====================================================================
-- 3. Rename columns.
-- =====================================================================
ALTER TABLE public.profiles            RENAME COLUMN total_points  TO total_tokens;
ALTER TABLE public.projects            RENAME COLUMN reward_points TO reward_tokens;
ALTER TABLE public.vouchers            RENAME COLUMN points_cost   TO tokens_cost;
ALTER TABLE public.voucher_redemptions RENAME COLUMN points_spent  TO tokens_spent;
ALTER TABLE public.voucher_redemptions RENAME COLUMN points_txn_id TO tokens_txn_id;

-- =====================================================================
-- 4. Rename constraints to match.
-- =====================================================================
ALTER TABLE public.profiles            RENAME CONSTRAINT profiles_total_points_nonneg           TO profiles_total_tokens_nonneg;
ALTER TABLE public.projects            RENAME CONSTRAINT projects_reward_points_nonneg          TO projects_reward_tokens_nonneg;
ALTER TABLE public.vouchers            RENAME CONSTRAINT vouchers_points_cost_check             TO vouchers_tokens_cost_check;
ALTER TABLE public.voucher_redemptions RENAME CONSTRAINT voucher_redemptions_points_spent_check TO voucher_redemptions_tokens_spent_check;

-- =====================================================================
-- 5. Rename the table.
-- =====================================================================
ALTER TABLE public.points_transactions RENAME TO tokens_transactions;

-- Rename indexes on the new table
ALTER INDEX public.points_transactions_pkey         RENAME TO tokens_transactions_pkey;
ALTER INDEX public.idx_points_txn_user_created      RENAME TO idx_tokens_txn_user_created;
ALTER INDEX public.idx_points_txn_idem_key          RENAME TO idx_tokens_txn_idem_key;
ALTER INDEX public.idx_points_txn_idempotent_credit RENAME TO idx_tokens_txn_idempotent_credit;

-- =====================================================================
-- 6. Move the system_settings key.
-- =====================================================================
UPDATE public.system_settings
   SET key = 'profile_completion_tokens'
 WHERE key = 'profile_completion_points';

-- =====================================================================
-- 7. Drop old functions and recreate with new names referencing new
--    columns/tables/enums.
-- =====================================================================
DROP FUNCTION IF EXISTS public.points_txn_before_insert() CASCADE;
DROP FUNCTION IF EXISTS public.points_txn_after_insert()  CASCADE;
DROP FUNCTION IF EXISTS public.add_points(uuid,integer,points_txn_reason,text,uuid,uuid,jsonb) CASCADE;
DROP FUNCTION IF EXISTS public.remove_points(uuid,integer,points_txn_reason,text,uuid,uuid,jsonb) CASCADE;
DROP FUNCTION IF EXISTS public.get_points_balance(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.recalculate_points_balances(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.reconcile_profile_completion_points(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.handle_profile_completion_after_insert() CASCADE;
DROP FUNCTION IF EXISTS public.handle_profile_completion_after_update() CASCADE;
DROP FUNCTION IF EXISTS public.send_tip(uuid,integer,text) CASCADE;
DROP FUNCTION IF EXISTS public.send_tip(uuid,integer,text,text) CASCADE;
DROP FUNCTION IF EXISTS public.send_tip_by_public_id(text,integer,text,text) CASCADE;
DROP FUNCTION IF EXISTS public.redeem_voucher(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.redeem_voucher(uuid,text) CASCADE;
DROP FUNCTION IF EXISTS public.process_earning_on_approval() CASCADE;

-- ---------- Balance maintenance triggers ----------
CREATE OR REPLACE FUNCTION public.tokens_txn_before_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE current_balance int;
BEGIN
  SELECT total_tokens INTO current_balance FROM public.profiles WHERE id = NEW.user_id FOR UPDATE;
  IF current_balance IS NULL THEN
    RAISE EXCEPTION 'Profile not found for user %', NEW.user_id;
  END IF;
  NEW.balance_after := current_balance + NEW.amount;
  IF NEW.balance_after < 0 THEN
    RAISE EXCEPTION 'INSUFFICIENT_TOKENS: balance % cannot cover %', current_balance, NEW.amount;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.tokens_txn_after_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  UPDATE public.profiles SET total_tokens = total_tokens + NEW.amount WHERE id = NEW.user_id;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_tokens_txn_before_insert
BEFORE INSERT ON public.tokens_transactions
FOR EACH ROW EXECUTE FUNCTION public.tokens_txn_before_insert();

CREATE TRIGGER trg_tokens_txn_after_insert
AFTER INSERT ON public.tokens_transactions
FOR EACH ROW EXECUTE FUNCTION public.tokens_txn_after_insert();

-- ---------- add_tokens / remove_tokens ----------
CREATE OR REPLACE FUNCTION public.add_tokens(
  _user_id uuid, _amount integer, _reason tokens_txn_reason,
  _reference_type text DEFAULT NULL, _reference_id uuid DEFAULT NULL,
  _counterparty_user_id uuid DEFAULT NULL, _metadata jsonb DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE inserted_id uuid;
BEGIN
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: add_tokens requires a positive amount';
  END IF;
  INSERT INTO public.tokens_transactions
    (user_id, amount, type, reason, reference_type, reference_id, counterparty_user_id, metadata)
  VALUES
    (_user_id, _amount, 'credit', _reason, _reference_type, _reference_id, _counterparty_user_id, _metadata)
  ON CONFLICT DO NOTHING
  RETURNING id INTO inserted_id;
  RETURN inserted_id;
END $$;

CREATE OR REPLACE FUNCTION public.remove_tokens(
  _user_id uuid, _amount integer, _reason tokens_txn_reason,
  _reference_type text DEFAULT NULL, _reference_id uuid DEFAULT NULL,
  _counterparty_user_id uuid DEFAULT NULL, _metadata jsonb DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE inserted_id uuid;
BEGIN
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: remove_tokens requires a positive amount';
  END IF;
  INSERT INTO public.tokens_transactions
    (user_id, amount, type, reason, reference_type, reference_id, counterparty_user_id, metadata)
  VALUES
    (_user_id, -_amount, 'debit', _reason, _reference_type, _reference_id, _counterparty_user_id, _metadata)
  RETURNING id INTO inserted_id;
  RETURN inserted_id;
END $$;

-- ---------- balance read ----------
CREATE OR REPLACE FUNCTION public.get_tokens_balance(_user_id uuid)
RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF auth.uid() <> _user_id AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  RETURN (
    SELECT COALESCE(SUM(amount), 0)::int
      FROM public.tokens_transactions
     WHERE user_id = _user_id
  );
END $$;

-- ---------- recalculate / reconcile ----------
CREATE OR REPLACE FUNCTION public.recalculate_tokens_balances(_user_id uuid DEFAULT NULL)
RETURNS TABLE(user_id uuid, total_tokens integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  RETURN QUERY
  WITH ledger AS (
    SELECT p.id, COALESCE(SUM(pt.amount), 0)::int AS ledger_total
    FROM public.profiles p
    LEFT JOIN public.tokens_transactions pt ON pt.user_id = p.id
    WHERE (_user_id IS NULL OR p.id = _user_id)
    GROUP BY p.id
  )
  UPDATE public.profiles p
     SET total_tokens = ledger.ledger_total
    FROM ledger
   WHERE p.id = ledger.id
     AND p.total_tokens IS DISTINCT FROM ledger.ledger_total
  RETURNING p.id, p.total_tokens;
END $$;

CREATE OR REPLACE FUNCTION public.reconcile_profile_completion_tokens(_user_id uuid DEFAULT NULL)
RETURNS TABLE(user_id uuid, delta integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  reward_tokens int := public.get_setting_int('profile_completion_tokens', 500);
  row_record RECORD;
  net_profile_tokens int;
  adjustment int;
BEGIN
  IF reward_tokens <= 0 THEN RETURN; END IF;
  FOR row_record IN
    SELECT p.* FROM public.profiles p
    WHERE (_user_id IS NULL OR p.id = _user_id)
      AND public.is_profile_complete(p)
  LOOP
    SELECT COALESCE(SUM(pt.amount), 0)
      INTO net_profile_tokens
    FROM public.tokens_transactions pt
    WHERE pt.user_id = row_record.id
      AND pt.reason IN ('profile_complete', 'profile_incomplete_revoke');

    adjustment := reward_tokens - COALESCE(net_profile_tokens, 0);

    IF adjustment > 0 THEN
      INSERT INTO public.tokens_transactions
        (user_id, amount, type, reason, reference_type, reference_id, metadata)
      VALUES
        (row_record.id, adjustment, 'credit', 'profile_complete', 'profile_reconciliation', gen_random_uuid(),
         jsonb_build_object('tokens', adjustment, 'source', 'profile_completion_reconciliation'));

      INSERT INTO public.notifications (user_id, title, message, link)
      VALUES (row_record.id, 'Profile Tokens Restored',
              'You earned ' || adjustment || ' tokens for your completed profile.',
              '/app/wallet');

      user_id := row_record.id;
      delta := adjustment;
      RETURN NEXT;
    END IF;
  END LOOP;
END $$;

-- ---------- profile completion triggers ----------
CREATE OR REPLACE FUNCTION public.handle_profile_completion_after_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE reward_tokens int;
BEGIN
  IF NOT public.is_profile_complete(NEW) THEN RETURN NULL; END IF;
  reward_tokens := public.get_setting_int('profile_completion_tokens', 500);
  IF reward_tokens <= 0 THEN RETURN NULL; END IF;

  INSERT INTO public.tokens_transactions
    (user_id, amount, type, reason, reference_type, reference_id, metadata)
  VALUES
    (NEW.id, reward_tokens, 'credit', 'profile_complete', 'profile_transition', gen_random_uuid(),
     jsonb_build_object('tokens', reward_tokens, 'transition', 'insert_complete'));

  INSERT INTO public.notifications (user_id, title, message, link)
  VALUES (NEW.id, 'Profile Complete 🎉',
          'You earned ' || reward_tokens || ' tokens for completing your profile!',
          '/app/wallet');
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.handle_profile_completion_after_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  reward_tokens int;
  was_complete boolean := public.is_profile_complete(OLD);
  is_complete  boolean := public.is_profile_complete(NEW);
  net_profile_tokens int;
  adjustment int;
BEGIN
  reward_tokens := public.get_setting_int('profile_completion_tokens', 500);
  IF reward_tokens <= 0 THEN RETURN NULL; END IF;

  IF is_complete AND NOT was_complete THEN
    INSERT INTO public.tokens_transactions
      (user_id, amount, type, reason, reference_type, reference_id, metadata)
    VALUES
      (NEW.id, reward_tokens, 'credit', 'profile_complete', 'profile_transition', gen_random_uuid(),
       jsonb_build_object('tokens', reward_tokens, 'transition', 'incomplete_to_complete'));
    INSERT INTO public.notifications (user_id, title, message, link)
    VALUES (NEW.id, 'Profile Complete 🎉',
            'You earned ' || reward_tokens || ' tokens for completing your profile!', '/app/wallet');
    RETURN NULL;
  END IF;

  IF was_complete AND NOT is_complete THEN
    INSERT INTO public.tokens_transactions
      (user_id, amount, type, reason, reference_type, reference_id, metadata)
    VALUES
      (NEW.id, -reward_tokens, 'debit', 'profile_incomplete_revoke', 'profile_transition', gen_random_uuid(),
       jsonb_build_object('tokens', reward_tokens, 'transition', 'complete_to_incomplete'));
    INSERT INTO public.notifications (user_id, title, message, link)
    VALUES (NEW.id, 'Profile Incomplete',
            reward_tokens || ' tokens were removed because your profile is no longer complete.', '/app/profile');
    RETURN NULL;
  END IF;

  IF is_complete THEN
    SELECT COALESCE(SUM(pt.amount), 0)::int INTO net_profile_tokens
    FROM public.tokens_transactions pt
    WHERE pt.user_id = NEW.id
      AND pt.reason IN ('profile_complete', 'profile_incomplete_revoke');
    adjustment := reward_tokens - COALESCE(net_profile_tokens, 0);
    IF adjustment > 0 THEN
      INSERT INTO public.tokens_transactions
        (user_id, amount, type, reason, reference_type, reference_id, metadata)
      VALUES
        (NEW.id, adjustment, 'credit', 'profile_complete', 'profile_reconciliation', gen_random_uuid(),
         jsonb_build_object('tokens', adjustment, 'source', 'profile_completion_reconciliation'));
      INSERT INTO public.notifications (user_id, title, message, link)
      VALUES (NEW.id, 'Profile Tokens Restored',
              'You earned ' || adjustment || ' tokens for your completed profile.', '/app/wallet');
    END IF;
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER trg_handle_profile_completion_after_insert
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.handle_profile_completion_after_insert();

CREATE TRIGGER trg_handle_profile_completion_after_update
AFTER UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.handle_profile_completion_after_update();

-- ---------- send_tip / send_tip_by_public_id ----------
CREATE OR REPLACE FUNCTION public.send_tip(
  _recipient_id uuid, _amount integer, _note text DEFAULT NULL, _idempotency_key text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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

  IF _idempotency_key IS NOT NULL AND btrim(_idempotency_key) <> '' THEN
    SELECT id, amount, counterparty_user_id, metadata INTO existing
      FROM public.tokens_transactions
     WHERE user_id = sender_id AND reason = 'tip_sent'
       AND metadata->>'idempotency_key' = _idempotency_key
     LIMIT 1;
    IF existing.id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'debit_id', existing.id,
        'amount', -existing.amount,
        'recipient_id', existing.counterparty_user_id,
        'replayed', true);
    END IF;
  END IF;

  min_tip := public.get_setting_int('tip_min_amount', 10);
  max_tip := public.get_setting_int('tip_max_amount', 1000);
  daily_cap := public.get_setting_int('tip_daily_cap', 5000);

  IF _amount IS NULL OR _amount < min_tip THEN
    RAISE EXCEPTION 'AMOUNT_TOO_LOW: minimum tip is % tokens', min_tip;
  END IF;
  IF _amount > max_tip THEN
    RAISE EXCEPTION 'AMOUNT_TOO_HIGH: maximum tip is % tokens', max_tip;
  END IF;

  SELECT is_active INTO recipient_active FROM public.profiles WHERE id = _recipient_id;
  IF recipient_active IS NULL THEN RAISE EXCEPTION 'RECIPIENT_NOT_FOUND: no user with that ID'; END IF;
  IF recipient_active = false THEN RAISE EXCEPTION 'RECIPIENT_INACTIVE: recipient account is not active'; END IF;

  SELECT COALESCE(SUM(-amount), 0) INTO daily_total
    FROM public.tokens_transactions
   WHERE user_id = sender_id AND reason = 'tip_sent'
     AND created_at >= date_trunc('day', now());
  IF daily_total + _amount > daily_cap THEN
    RAISE EXCEPTION 'DAILY_CAP_EXCEEDED: daily tip limit of % tokens reached', daily_cap;
  END IF;

  meta := jsonb_build_object('note', _note, 'sender_id', sender_id,
                             'recipient_id', _recipient_id,
                             'idempotency_key', _idempotency_key);

  INSERT INTO public.tokens_transactions
    (user_id, amount, type, reason, reference_type, counterparty_user_id, metadata)
  VALUES (sender_id, -_amount, 'debit', 'tip_sent', 'tip', _recipient_id, meta)
  RETURNING id INTO debit_id;

  INSERT INTO public.tokens_transactions
    (user_id, amount, type, reason, reference_type, reference_id, counterparty_user_id, metadata)
  VALUES (_recipient_id, _amount, 'credit', 'tip_received', 'tip', debit_id, sender_id, meta)
  RETURNING id INTO credit_id;

  INSERT INTO public.notifications (user_id, title, message, link)
  VALUES (_recipient_id, 'You received a tip 🎁',
          'Someone sent you ' || _amount || ' tokens!', '/app/wallet');

  RETURN jsonb_build_object('debit_id', debit_id, 'credit_id', credit_id,
                            'amount', _amount, 'recipient_id', _recipient_id,
                            'replayed', false);
END $$;

CREATE OR REPLACE FUNCTION public.send_tip_by_public_id(
  _recipient_public_id text, _amount integer, _note text DEFAULT NULL, _idempotency_key text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE resolved_id uuid; cleaned text;
BEGIN
  IF _recipient_public_id IS NULL OR btrim(_recipient_public_id) = '' THEN
    RAISE EXCEPTION 'INVALID_RECIPIENT: recipient is required';
  END IF;
  cleaned := upper(btrim(_recipient_public_id));
  SELECT id INTO resolved_id FROM public.profiles
    WHERE upper(public_user_id) = cleaned LIMIT 1;
  IF resolved_id IS NULL THEN
    RAISE EXCEPTION 'RECIPIENT_NOT_FOUND: no user with that ID';
  END IF;
  RETURN public.send_tip(resolved_id, _amount, _note, _idempotency_key);
END $$;

-- ---------- redeem_voucher ----------
CREATE OR REPLACE FUNCTION public.redeem_voucher(_voucher_id uuid, _idempotency_key text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  uid uuid := auth.uid();
  v RECORD;
  code_row RECORD;
  redemption_id uuid;
  txn_id uuid;
  existing RECORD;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;

  IF _idempotency_key IS NOT NULL AND btrim(_idempotency_key) <> '' THEN
    SELECT vr.id, vr.code_snapshot, vr.voucher_title_snapshot,
           vr.voucher_value_inr_snapshot, vr.tokens_spent
      INTO existing
      FROM public.voucher_redemptions vr
      JOIN public.tokens_transactions pt ON pt.id = vr.tokens_txn_id
     WHERE vr.user_id = uid AND vr.voucher_id = _voucher_id
       AND pt.metadata->>'idempotency_key' = _idempotency_key
     LIMIT 1;
    IF existing.id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'redemption_id', existing.id, 'code', existing.code_snapshot,
        'voucher_title', existing.voucher_title_snapshot,
        'value_inr', existing.voucher_value_inr_snapshot,
        'tokens_spent', existing.tokens_spent, 'replayed', true);
    END IF;
  END IF;

  SELECT * INTO v FROM public.vouchers WHERE id = _voucher_id FOR SHARE;
  IF v IS NULL THEN RAISE EXCEPTION 'VOUCHER_NOT_FOUND'; END IF;
  IF v.is_active = false THEN RAISE EXCEPTION 'VOUCHER_INACTIVE'; END IF;

  SELECT * INTO code_row FROM public.voucher_codes
   WHERE voucher_id = _voucher_id AND assigned_to IS NULL
   ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1;
  IF code_row IS NULL THEN RAISE EXCEPTION 'OUT_OF_STOCK: no codes available for this voucher'; END IF;

  redemption_id := gen_random_uuid();

  INSERT INTO public.tokens_transactions
    (user_id, amount, type, reason, reference_type, reference_id, metadata)
  VALUES
    (uid, -v.tokens_cost, 'debit', 'voucher_redeemed', 'voucher_redemption', redemption_id,
     jsonb_build_object('voucher_id', v.id, 'brand', v.brand, 'value_inr', v.value_inr,
                        'idempotency_key', _idempotency_key))
  RETURNING id INTO txn_id;

  INSERT INTO public.voucher_redemptions
    (id, user_id, voucher_id, voucher_code_id, code_snapshot, tokens_spent,
     voucher_title_snapshot, voucher_brand_snapshot, voucher_value_inr_snapshot,
     status, tokens_txn_id)
  VALUES
    (redemption_id, uid, v.id, code_row.id, code_row.code, v.tokens_cost,
     v.title, v.brand, v.value_inr, 'fulfilled', txn_id);

  UPDATE public.voucher_codes
     SET assigned_to = uid, assigned_at = now(), redemption_id = redemption_id
   WHERE id = code_row.id;

  INSERT INTO public.notifications (user_id, title, message, link)
  VALUES (uid, 'Voucher Redeemed 🎉',
          'Your ' || v.title || ' is ready. Check your wallet.', '/app/wallet');

  RETURN jsonb_build_object(
    'redemption_id', redemption_id, 'code', code_row.code,
    'voucher_title', v.title, 'value_inr', v.value_inr,
    'tokens_spent', v.tokens_cost, 'replayed', false);
END $$;

-- ---------- process_earning_on_approval ----------
CREATE OR REPLACE FUNCTION public.process_earning_on_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE task_pay numeric; task_tokens int;
BEGIN
  IF OLD.status = 'in_review' AND NEW.status = 'approved' THEN
    SELECT COALESCE(pay_per_task, 0), COALESCE(reward_tokens, 0)
      INTO task_pay, task_tokens
    FROM public.projects WHERE id = NEW.project_id;

    IF NOT EXISTS (SELECT 1 FROM public.earnings WHERE task_id = NEW.id) THEN
      INSERT INTO public.earnings (user_id, project_id, task_id, amount, status)
      VALUES (NEW.user_id, NEW.project_id, NEW.id, task_pay, 'approved');
      UPDATE public.profiles
        SET wallet_balance = wallet_balance + task_pay,
            total_earned   = total_earned + task_pay
        WHERE id = NEW.user_id;
    END IF;

    IF task_tokens > 0 THEN
      INSERT INTO public.tokens_transactions
        (user_id, amount, type, reason, reference_type, reference_id, metadata)
      VALUES
        (NEW.user_id, task_tokens, 'credit', 'task_reward', 'task', NEW.id,
         jsonb_build_object('tokens', task_tokens, 'project_id', NEW.project_id))
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- Re-attach process_earning_on_approval trigger on tasks (it was dropped via CASCADE)
DROP TRIGGER IF EXISTS trg_process_earning_on_approval ON public.tasks;
CREATE TRIGGER trg_process_earning_on_approval
AFTER UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.process_earning_on_approval();
