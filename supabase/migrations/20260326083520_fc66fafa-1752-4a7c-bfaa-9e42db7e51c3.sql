
-- Notifications table
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT false,
  link TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can read their own notifications
CREATE POLICY "Users can read own notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Users can update their own notifications (mark as read)
CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- System inserts via trigger (SECURITY DEFINER)
-- Trigger to create notification on submission status change
CREATE OR REPLACE FUNCTION public.notify_submission_status_change()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.status = 'pending' AND NEW.status IN ('approved', 'rejected') THEN
    INSERT INTO public.notifications (user_id, title, message, link)
    VALUES (
      NEW.contributor_id,
      CASE NEW.status
        WHEN 'approved' THEN 'Submission Approved ✅'
        WHEN 'rejected' THEN 'Submission Needs Revision ❌'
      END,
      CASE NEW.status
        WHEN 'approved' THEN 'Your submission has been approved! Great work.'
        WHEN 'rejected' THEN 'Your submission was not accepted. Check the feedback and try again.'
      END,
      '/app/submissions'
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_submission_status_change
  AFTER UPDATE OF status ON public.submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_submission_status_change();

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
