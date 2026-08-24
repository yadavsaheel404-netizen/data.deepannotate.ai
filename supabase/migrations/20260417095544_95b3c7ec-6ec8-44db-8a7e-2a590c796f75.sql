-- Add overview field to tasks
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS overview text;

-- Add rejection_reason field to withdraw_requests
ALTER TABLE public.withdraw_requests ADD COLUMN IF NOT EXISTS rejection_reason text;

-- Update withdrawal notification trigger to include rejection reason
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
        'Your withdrawal of ₹' || NEW.amount || ' was rejected' ||
          CASE WHEN NEW.rejection_reason IS NOT NULL AND NEW.rejection_reason != ''
               THEN ': ' || NEW.rejection_reason
               ELSE '. Please contact support.' END,
        '/app/wallet'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;