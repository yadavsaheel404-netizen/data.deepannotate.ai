CREATE OR REPLACE FUNCTION public.enforce_withdraw_request_payment_snapshots()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  profile_record RECORD;
BEGIN
  SELECT upi_id, account_holder_name, bank_account_number, ifsc_code
    INTO profile_record
  FROM public.profiles
  WHERE id = NEW.user_id;

  IF TG_OP = 'INSERT' THEN
    NEW.upi_id := COALESCE(NEW.upi_id, profile_record.upi_id);
    NEW.account_holder_name := COALESCE(NEW.account_holder_name, profile_record.account_holder_name);
    NEW.bank_account_number := COALESCE(NEW.bank_account_number, profile_record.bank_account_number);
    NEW.ifsc_code := COALESCE(NEW.ifsc_code, profile_record.ifsc_code);

    NEW.upi_id_snapshot := COALESCE(NEW.upi_id_snapshot, NEW.upi_id, profile_record.upi_id);
    NEW.account_holder_name_snapshot := COALESCE(NEW.account_holder_name_snapshot, NEW.account_holder_name, profile_record.account_holder_name);
    NEW.bank_account_snapshot := COALESCE(NEW.bank_account_snapshot, NEW.bank_account_number, profile_record.bank_account_number);
    NEW.ifsc_snapshot := COALESCE(NEW.ifsc_snapshot, NEW.ifsc_code, profile_record.ifsc_code);

    RETURN NEW;
  END IF;

  IF NEW.status IN ('approved', 'paid', 'rejected') THEN
    NEW.upi_id_snapshot := COALESCE(OLD.upi_id_snapshot, NEW.upi_id_snapshot, OLD.upi_id, profile_record.upi_id);
    NEW.account_holder_name_snapshot := COALESCE(OLD.account_holder_name_snapshot, NEW.account_holder_name_snapshot, OLD.account_holder_name, profile_record.account_holder_name);
    NEW.bank_account_snapshot := COALESCE(OLD.bank_account_snapshot, NEW.bank_account_snapshot, OLD.bank_account_number, profile_record.bank_account_number);
    NEW.ifsc_snapshot := COALESCE(OLD.ifsc_snapshot, NEW.ifsc_snapshot, OLD.ifsc_code, profile_record.ifsc_code);
  ELSE
    NEW.upi_id_snapshot := COALESCE(OLD.upi_id_snapshot, NEW.upi_id_snapshot);
    NEW.account_holder_name_snapshot := COALESCE(OLD.account_holder_name_snapshot, NEW.account_holder_name_snapshot);
    NEW.bank_account_snapshot := COALESCE(OLD.bank_account_snapshot, NEW.bank_account_snapshot);
    NEW.ifsc_snapshot := COALESCE(OLD.ifsc_snapshot, NEW.ifsc_snapshot);
  END IF;

  IF OLD.status IN ('approved', 'paid', 'rejected') THEN
    NEW.upi_id := COALESCE(OLD.upi_id, OLD.upi_id_snapshot, NEW.upi_id);
    NEW.account_holder_name := COALESCE(OLD.account_holder_name, OLD.account_holder_name_snapshot, NEW.account_holder_name);
    NEW.bank_account_number := COALESCE(OLD.bank_account_number, OLD.bank_account_snapshot, NEW.bank_account_number);
    NEW.ifsc_code := COALESCE(OLD.ifsc_code, OLD.ifsc_snapshot, NEW.ifsc_code);

    NEW.upi_id_snapshot := COALESCE(OLD.upi_id_snapshot, NEW.upi_id_snapshot);
    NEW.account_holder_name_snapshot := COALESCE(OLD.account_holder_name_snapshot, NEW.account_holder_name_snapshot);
    NEW.bank_account_snapshot := COALESCE(OLD.bank_account_snapshot, NEW.bank_account_snapshot);
    NEW.ifsc_snapshot := COALESCE(OLD.ifsc_snapshot, NEW.ifsc_snapshot);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_withdraw_request_payment_snapshots ON public.withdraw_requests;

CREATE TRIGGER enforce_withdraw_request_payment_snapshots
BEFORE INSERT OR UPDATE ON public.withdraw_requests
FOR EACH ROW
EXECUTE FUNCTION public.enforce_withdraw_request_payment_snapshots();