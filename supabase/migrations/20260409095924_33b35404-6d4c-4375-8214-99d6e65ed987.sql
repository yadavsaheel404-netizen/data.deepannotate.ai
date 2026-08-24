
-- Create withdraw_requests table
CREATE TABLE public.withdraw_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  amount NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  processed_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.withdraw_requests ENABLE ROW LEVEL SECURITY;

-- Users can view their own requests
CREATE POLICY "Users can view own withdraw requests"
ON public.withdraw_requests
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Users can create their own requests
CREATE POLICY "Users can create own withdraw requests"
ON public.withdraw_requests
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Admins can view all requests
CREATE POLICY "Admins can view all withdraw requests"
ON public.withdraw_requests
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Admins can update all requests
CREATE POLICY "Admins can update all withdraw requests"
ON public.withdraw_requests
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));
