-- Add PayPal/method fields to withdraw_requests for international payouts
ALTER TABLE public.withdraw_requests
  ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'india',
  ADD COLUMN IF NOT EXISTS paypal_email TEXT,
  ADD COLUMN IF NOT EXISTS paypal_email_snapshot TEXT;

-- Update snapshot trigger to also capture payment_method + paypal_email from profile
CREATE OR REPLACE FUNCTION public.enforce_withdraw_request_payment_snapshots()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  profile_record RECORD;
BEGIN
  SELECT upi_id, account_holder_name, bank_account_number, ifsc_code, payout_country, paypal_email
    INTO profile_record
  FROM public.profiles
  WHERE id = NEW.user_id;

  IF TG_OP = 'INSERT' THEN
    -- Default payment_method from profile.payout_country if not provided
    IF NEW.payment_method IS NULL OR btrim(NEW.payment_method) = '' OR NEW.payment_method = 'india' THEN
      IF profile_record.payout_country IS NOT NULL
         AND lower(profile_record.payout_country) NOT IN ('india', 'in') THEN
        NEW.payment_method := 'paypal';
      END IF;
    END IF;

    NEW.upi_id := COALESCE(NEW.upi_id, profile_record.upi_id);
    NEW.account_holder_name := COALESCE(NEW.account_holder_name, profile_record.account_holder_name);
    NEW.bank_account_number := COALESCE(NEW.bank_account_number, profile_record.bank_account_number);
    NEW.ifsc_code := COALESCE(NEW.ifsc_code, profile_record.ifsc_code);
    NEW.paypal_email := COALESCE(NEW.paypal_email, profile_record.paypal_email);

    NEW.upi_id_snapshot := COALESCE(NEW.upi_id_snapshot, NEW.upi_id, profile_record.upi_id);
    NEW.account_holder_name_snapshot := COALESCE(NEW.account_holder_name_snapshot, NEW.account_holder_name, profile_record.account_holder_name);
    NEW.bank_account_snapshot := COALESCE(NEW.bank_account_snapshot, NEW.bank_account_number, profile_record.bank_account_number);
    NEW.ifsc_snapshot := COALESCE(NEW.ifsc_snapshot, NEW.ifsc_code, profile_record.ifsc_code);
    NEW.paypal_email_snapshot := COALESCE(NEW.paypal_email_snapshot, NEW.paypal_email, profile_record.paypal_email);

    RETURN NEW;
  END IF;

  IF NEW.status IN ('approved', 'paid', 'rejected') THEN
    NEW.upi_id_snapshot := COALESCE(OLD.upi_id_snapshot, NEW.upi_id_snapshot, OLD.upi_id, profile_record.upi_id);
    NEW.account_holder_name_snapshot := COALESCE(OLD.account_holder_name_snapshot, NEW.account_holder_name_snapshot, OLD.account_holder_name, profile_record.account_holder_name);
    NEW.bank_account_snapshot := COALESCE(OLD.bank_account_snapshot, NEW.bank_account_snapshot, OLD.bank_account_number, profile_record.bank_account_number);
    NEW.ifsc_snapshot := COALESCE(OLD.ifsc_snapshot, NEW.ifsc_snapshot, OLD.ifsc_code, profile_record.ifsc_code);
    NEW.paypal_email_snapshot := COALESCE(OLD.paypal_email_snapshot, NEW.paypal_email_snapshot, OLD.paypal_email, profile_record.paypal_email);
  ELSE
    NEW.upi_id_snapshot := COALESCE(OLD.upi_id_snapshot, NEW.upi_id_snapshot);
    NEW.account_holder_name_snapshot := COALESCE(OLD.account_holder_name_snapshot, NEW.account_holder_name_snapshot);
    NEW.bank_account_snapshot := COALESCE(OLD.bank_account_snapshot, NEW.bank_account_snapshot);
    NEW.ifsc_snapshot := COALESCE(OLD.ifsc_snapshot, NEW.ifsc_snapshot);
    NEW.paypal_email_snapshot := COALESCE(OLD.paypal_email_snapshot, NEW.paypal_email_snapshot);
  END IF;

  IF OLD.status IN ('approved', 'paid', 'rejected') THEN
    NEW.upi_id := COALESCE(OLD.upi_id, OLD.upi_id_snapshot, NEW.upi_id);
    NEW.account_holder_name := COALESCE(OLD.account_holder_name, OLD.account_holder_name_snapshot, NEW.account_holder_name);
    NEW.bank_account_number := COALESCE(OLD.bank_account_number, OLD.bank_account_snapshot, NEW.bank_account_number);
    NEW.ifsc_code := COALESCE(OLD.ifsc_code, OLD.ifsc_snapshot, NEW.ifsc_code);
    NEW.paypal_email := COALESCE(OLD.paypal_email, OLD.paypal_email_snapshot, NEW.paypal_email);
    NEW.payment_method := COALESCE(OLD.payment_method, NEW.payment_method);

    NEW.upi_id_snapshot := COALESCE(OLD.upi_id_snapshot, NEW.upi_id_snapshot);
    NEW.account_holder_name_snapshot := COALESCE(OLD.account_holder_name_snapshot, NEW.account_holder_name_snapshot);
    NEW.bank_account_snapshot := COALESCE(OLD.bank_account_snapshot, NEW.bank_account_snapshot);
    NEW.ifsc_snapshot := COALESCE(OLD.ifsc_snapshot, NEW.ifsc_snapshot);
    NEW.paypal_email_snapshot := COALESCE(OLD.paypal_email_snapshot, NEW.paypal_email_snapshot);
  END IF;

  RETURN NEW;
END;
$function$;