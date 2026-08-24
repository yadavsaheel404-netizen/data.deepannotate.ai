
CREATE OR REPLACE FUNCTION public.notify_withdraw_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status != NEW.status THEN
    IF NEW.status = 'approved' THEN
      INSERT INTO public.notifications (user_id, title, message, link)
      VALUES (
        NEW.user_id,
        'Withdrawal Approved ✅',
        'Your withdrawal request of ₹' || NEW.amount || ' has been approved. Payment will be processed soon.',
        '/app/wallet'
      );
    ELSIF NEW.status = 'paid' THEN
      INSERT INTO public.notifications (user_id, title, message, link)
      VALUES (
        NEW.user_id,
        'Payment Sent 💸',
        'Your withdrawal of ₹' || NEW.amount || ' has been paid to your account.',
        '/app/wallet'
      );
    ELSIF NEW.status = 'rejected' THEN
      INSERT INTO public.notifications (user_id, title, message, link)
      VALUES (
        NEW.user_id,
        'Withdrawal Rejected ❌',
        'Your withdrawal request of ₹' || NEW.amount || ' was rejected. Please contact support.',
        '/app/wallet'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER on_withdraw_status_change
  AFTER UPDATE ON public.withdraw_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_withdraw_status_change();
