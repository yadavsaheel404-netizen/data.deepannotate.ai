
-- Allow admins to insert notifications (for bulk sends from Communications page)
CREATE POLICY "Admins can insert notifications"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to read all notifications (for admin oversight)
CREATE POLICY "Admins can read all notifications"
ON public.notifications
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));
