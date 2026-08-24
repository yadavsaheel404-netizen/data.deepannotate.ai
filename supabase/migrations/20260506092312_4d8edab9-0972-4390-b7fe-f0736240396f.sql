ALTER TABLE public.earnings DROP CONSTRAINT earnings_status_check;
ALTER TABLE public.earnings ADD CONSTRAINT earnings_status_check CHECK (status IN ('approved', 'paid', 'voided'));