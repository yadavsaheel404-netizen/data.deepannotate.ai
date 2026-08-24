
-- Add wallet and payment fields to profiles
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS wallet_balance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_earned numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_paid numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS upi_id text,
  ADD COLUMN IF NOT EXISTS account_holder_name text,
  ADD COLUMN IF NOT EXISTS bank_account_number text,
  ADD COLUMN IF NOT EXISTS ifsc_code text;

-- Create earnings table
CREATE TABLE public.earnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  task_id uuid NOT NULL,
  submission_id uuid NOT NULL UNIQUE,
  amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'paid')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS on earnings
ALTER TABLE public.earnings ENABLE ROW LEVEL SECURITY;

-- Users can view their own earnings
CREATE POLICY "Users can view own earnings" ON public.earnings
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Admins can manage all earnings
CREATE POLICY "Admins can manage all earnings" ON public.earnings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- DB function: called when a submission is approved to create earning + update wallet
CREATE OR REPLACE FUNCTION public.process_earning_on_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  task_pay numeric;
BEGIN
  -- Only run when status changes to approved
  IF OLD.status = 'pending' AND NEW.status = 'approved' THEN
    -- Check no duplicate earning for this submission
    IF NOT EXISTS (SELECT 1 FROM public.earnings WHERE submission_id = NEW.id) THEN
      -- Get pay_per_task
      SELECT COALESCE(pay_per_task, 0) INTO task_pay FROM public.tasks WHERE id = NEW.task_id;
      
      -- Insert earning record
      INSERT INTO public.earnings (user_id, task_id, submission_id, amount, status)
      VALUES (NEW.contributor_id, NEW.task_id, NEW.id, task_pay, 'approved');
      
      -- Update profile wallet
      UPDATE public.profiles
      SET wallet_balance = wallet_balance + task_pay,
          total_earned = total_earned + task_pay
      WHERE id = NEW.contributor_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger on submissions for earning processing
CREATE TRIGGER trigger_process_earning
  AFTER UPDATE ON public.submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.process_earning_on_approval();
