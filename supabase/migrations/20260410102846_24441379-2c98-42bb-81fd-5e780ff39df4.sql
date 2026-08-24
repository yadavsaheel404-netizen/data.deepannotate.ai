
-- Add country column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS country text;

-- Create communications table for admin message history
CREATE TABLE public.communications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject text NOT NULL,
  body text NOT NULL,
  recipients uuid[] NOT NULL DEFAULT '{}',
  recipient_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'sent',
  sent_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.communications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage communications"
ON public.communications FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));
