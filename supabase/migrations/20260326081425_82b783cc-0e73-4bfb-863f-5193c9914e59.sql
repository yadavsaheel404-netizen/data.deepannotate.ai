
-- Create media type enum
CREATE TYPE public.media_type AS ENUM ('text', 'audio', 'image', 'video');

-- Create task status enum
CREATE TYPE public.task_status AS ENUM ('draft', 'active', 'paused', 'completed');

-- Create tasks table
CREATE TABLE public.tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  instructions TEXT NOT NULL,
  media_type media_type NOT NULL DEFAULT 'text',
  duration_minutes INTEGER NOT NULL DEFAULT 5,
  total_slots INTEGER NOT NULL DEFAULT 10,
  filled_slots INTEGER NOT NULL DEFAULT 0,
  deadline TIMESTAMP WITH TIME ZONE,
  languages TEXT[] NOT NULL DEFAULT '{en}',
  status task_status NOT NULL DEFAULT 'draft',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins can manage tasks"
ON public.tasks FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Contributors can view active tasks matching their language
CREATE POLICY "Contributors can view active tasks"
ON public.tasks FOR SELECT TO authenticated
USING (status = 'active');

-- Add updated_at trigger
CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
