CREATE OR REPLACE FUNCTION public.notify_support_ticket_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status = 'in_progress' THEN
      INSERT INTO public.notifications (user_id, title, message, link)
      VALUES (
        NEW.user_id,
        'Support ticket update',
        'Your support request is being reviewed by our team. We''ll get back to you shortly.',
        '/app/profile'
      );
    ELSIF NEW.status = 'resolved' THEN
      INSERT INTO public.notifications (user_id, title, message, link)
      VALUES (
        NEW.user_id,
        'Support ticket resolved',
        'Your support request has been resolved. If you still have issues, feel free to reach out again.',
        '/app/profile'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS support_ticket_status_change_notify ON public.support_tickets;
CREATE TRIGGER support_ticket_status_change_notify
AFTER UPDATE ON public.support_tickets
FOR EACH ROW
EXECUTE FUNCTION public.notify_support_ticket_status_change();