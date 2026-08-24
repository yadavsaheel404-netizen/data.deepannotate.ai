-- Support tickets table
CREATE TABLE public.support_tickets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  user_name TEXT NOT NULL,
  user_email TEXT NOT NULL,
  category TEXT NOT NULL,
  message TEXT NOT NULL,
  screenshot_url TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create own tickets"
ON public.support_tickets FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own tickets"
ON public.support_tickets FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all tickets"
ON public.support_tickets FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update all tickets"
ON public.support_tickets FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_support_tickets_updated_at
BEFORE UPDATE ON public.support_tickets
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_support_tickets_user ON public.support_tickets(user_id);
CREATE INDEX idx_support_tickets_status ON public.support_tickets(status);

-- Storage bucket for screenshots
INSERT INTO storage.buckets (id, name, public) VALUES ('support-screenshots', 'support-screenshots', true);

CREATE POLICY "Anyone can view support screenshots"
ON storage.objects FOR SELECT
USING (bucket_id = 'support-screenshots');

CREATE POLICY "Users can upload own support screenshots"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'support-screenshots' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Admins can manage support screenshots"
ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'support-screenshots' AND has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (bucket_id = 'support-screenshots' AND has_role(auth.uid(), 'admin'::app_role));