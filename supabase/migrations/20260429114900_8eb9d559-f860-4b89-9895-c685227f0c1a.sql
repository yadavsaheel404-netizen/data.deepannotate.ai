-- ============ VOUCHER CATALOG ============
CREATE TABLE public.vouchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  brand text NOT NULL,
  value_inr numeric NOT NULL CHECK (value_inr > 0),
  points_cost int NOT NULL CHECK (points_cost > 0),
  image_url text,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_vouchers_active ON public.vouchers(is_active);

ALTER TABLE public.vouchers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view active vouchers"
  ON public.vouchers FOR SELECT TO authenticated
  USING (is_active = true OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage vouchers"
  ON public.vouchers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_vouchers_updated_at
  BEFORE UPDATE ON public.vouchers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ VOUCHER CODE POOL ============
CREATE TABLE public.voucher_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id uuid NOT NULL REFERENCES public.vouchers(id) ON DELETE CASCADE,
  code text NOT NULL,
  assigned_to uuid,           -- user_id who redeemed it
  assigned_at timestamptz,
  redemption_id uuid,         -- back-link to the redemption row
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (voucher_id, code)
);
CREATE INDEX idx_voucher_codes_unassigned
  ON public.voucher_codes(voucher_id) WHERE assigned_to IS NULL;

ALTER TABLE public.voucher_codes ENABLE ROW LEVEL SECURITY;

-- Codes are NEVER directly readable by users; only admins can read the raw pool.
CREATE POLICY "Admins can manage voucher codes"
  ON public.voucher_codes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- ============ REDEMPTIONS ============
CREATE TABLE public.voucher_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  voucher_id uuid NOT NULL REFERENCES public.vouchers(id),
  voucher_code_id uuid REFERENCES public.voucher_codes(id),
  code_snapshot text NOT NULL,        -- the actual code shown to the user
  points_spent int NOT NULL CHECK (points_spent > 0),
  voucher_title_snapshot text NOT NULL,
  voucher_brand_snapshot text NOT NULL,
  voucher_value_inr_snapshot numeric NOT NULL,
  status text NOT NULL DEFAULT 'fulfilled', -- fulfilled | revoked
  points_txn_id uuid,                  -- ledger row reference
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_voucher_redemptions_user ON public.voucher_redemptions(user_id, created_at DESC);

ALTER TABLE public.voucher_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own redemptions"
  ON public.voucher_redemptions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all redemptions"
  ON public.voucher_redemptions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update redemptions"
  ON public.voucher_redemptions FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- ============ REDEEM RPC ============
CREATE OR REPLACE FUNCTION public.redeem_voucher(_voucher_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  v RECORD;
  code_row RECORD;
  redemption_id uuid;
  txn_id uuid;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  -- Lock voucher row
  SELECT * INTO v FROM public.vouchers WHERE id = _voucher_id FOR SHARE;
  IF v IS NULL THEN
    RAISE EXCEPTION 'VOUCHER_NOT_FOUND';
  END IF;
  IF v.is_active = false THEN
    RAISE EXCEPTION 'VOUCHER_INACTIVE';
  END IF;

  -- Reserve the next available code (skip-locked so concurrent redemptions don't collide)
  SELECT * INTO code_row
  FROM public.voucher_codes
  WHERE voucher_id = _voucher_id AND assigned_to IS NULL
  ORDER BY created_at
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF code_row IS NULL THEN
    RAISE EXCEPTION 'OUT_OF_STOCK: no codes available for this voucher';
  END IF;

  redemption_id := gen_random_uuid();

  -- Debit points (BEFORE INSERT trigger raises INSUFFICIENT_POINTS if balance too low)
  INSERT INTO public.points_transactions
    (user_id, amount, type, reason, reference_type, reference_id, metadata)
  VALUES
    (uid, -v.points_cost, 'debit', 'voucher_redeemed', 'voucher_redemption', redemption_id,
     jsonb_build_object('voucher_id', v.id, 'brand', v.brand, 'value_inr', v.value_inr))
  RETURNING id INTO txn_id;

  -- Create redemption row
  INSERT INTO public.voucher_redemptions
    (id, user_id, voucher_id, voucher_code_id, code_snapshot, points_spent,
     voucher_title_snapshot, voucher_brand_snapshot, voucher_value_inr_snapshot,
     status, points_txn_id)
  VALUES
    (redemption_id, uid, v.id, code_row.id, code_row.code, v.points_cost,
     v.title, v.brand, v.value_inr, 'fulfilled', txn_id);

  -- Mark code as used
  UPDATE public.voucher_codes
  SET assigned_to = uid, assigned_at = now(), redemption_id = redemption_id
  WHERE id = code_row.id;

  -- Notify
  INSERT INTO public.notifications (user_id, title, message, link)
  VALUES (uid, 'Voucher Redeemed 🎉',
          'Your ' || v.title || ' is ready. Check your wallet.',
          '/app/wallet');

  RETURN jsonb_build_object(
    'redemption_id', redemption_id,
    'code', code_row.code,
    'voucher_title', v.title,
    'value_inr', v.value_inr,
    'points_spent', v.points_cost
  );
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_voucher(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_voucher(uuid) TO authenticated, service_role;

-- ============ SEED DATA ============
WITH seeded AS (
  INSERT INTO public.vouchers (title, brand, value_inr, points_cost, description) VALUES
    ('₹100 Amazon Voucher', 'Amazon', 100, 1000, 'Redeemable on amazon.in'),
    ('₹500 Flipkart Voucher', 'Flipkart', 500, 4500, 'Redeemable on flipkart.com'),
    ('₹1000 Swiggy Voucher', 'Swiggy', 1000, 9000, 'Redeemable on Swiggy app')
  RETURNING id, brand
)
INSERT INTO public.voucher_codes (voucher_id, code)
SELECT s.id,
       upper(s.brand) || '-' || lpad((gs)::text, 4, '0') || '-' ||
       substr(md5(random()::text || s.id::text || gs::text), 1, 8)
FROM seeded s
CROSS JOIN generate_series(1, 20) gs;