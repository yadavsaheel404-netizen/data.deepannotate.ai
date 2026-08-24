
-- Add financial detail columns to tasks table
ALTER TABLE public.tasks
  ADD COLUMN pay_per_task numeric DEFAULT 0,
  ADD COLUMN bonus_amount numeric DEFAULT 0,
  ADD COLUMN payment_terms text DEFAULT 'on_completion',
  ADD COLUMN start_date timestamp with time zone,
  ADD COLUMN end_date timestamp with time zone;

-- Create a public storage bucket for task media (images/audio/video in descriptions)
INSERT INTO storage.buckets (id, name, public) VALUES ('task-media', 'task-media', true);

-- Allow authenticated users to upload to task-media bucket
CREATE POLICY "Admins can upload task media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'task-media' AND public.has_role(auth.uid(), 'admin'));

-- Allow public read access to task media
CREATE POLICY "Public can read task media"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'task-media');
