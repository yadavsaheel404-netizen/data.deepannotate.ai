ALTER TABLE public.withdraw_requests
  ADD COLUMN IF NOT EXISTS upi_id_snapshot text,
  ADD COLUMN IF NOT EXISTS account_holder_name_snapshot text,
  ADD COLUMN IF NOT EXISTS bank_account_snapshot text,
  ADD COLUMN IF NOT EXISTS ifsc_snapshot text;

-- Backfill snapshot values from existing fields where missing
UPDATE public.withdraw_requests
SET
  upi_id_snapshot = COALESCE(upi_id_snapshot, upi_id),
  account_holder_name_snapshot = COALESCE(account_holder_name_snapshot, account_holder_name),
  bank_account_snapshot = COALESCE(bank_account_snapshot, bank_account_number),
  ifsc_snapshot = COALESCE(ifsc_snapshot, ifsc_code)
WHERE upi_id_snapshot IS NULL
   OR account_holder_name_snapshot IS NULL
   OR bank_account_snapshot IS NULL
   OR ifsc_snapshot IS NULL;