-- Migration: Complete Cleanup of HRM Contamination in gkkmmhjhsmrnhnlpgnrs
-- Step 1: Drop accidental HRM tables with foreign key references first (including invitations)

DROP TABLE IF EXISTS public.invitations CASCADE;
DROP TABLE IF EXISTS public.announcements CASCADE;
DROP TABLE IF EXISTS public.attendance CASCADE;
DROP TABLE IF EXISTS public.attendance_days CASCADE;
DROP TABLE IF EXISTS public.attendance_punches CASCADE;
DROP TABLE IF EXISTS public.automation_flags CASCADE;
DROP TABLE IF EXISTS public.automation_rules CASCADE;
DROP TABLE IF EXISTS public.automation_runs CASCADE;
DROP TABLE IF EXISTS public.blockers CASCADE;
DROP TABLE IF EXISTS public.breaks CASCADE;
DROP TABLE IF EXISTS public.daily_work_logs CASCADE;
DROP TABLE IF EXISTS public.documents CASCADE;
DROP TABLE IF EXISTS public.eod_reports CASCADE;
DROP TABLE IF EXISTS public.holidays CASCADE;
DROP TABLE IF EXISTS public.hourly_tasks CASCADE;
DROP TABLE IF EXISTS public.import_batches CASCADE;
DROP TABLE IF EXISTS public.leave_balances CASCADE;
DROP TABLE IF EXISTS public.leave_requests CASCADE;
DROP TABLE IF EXISTS public.leave_types CASCADE;
DROP TABLE IF EXISTS public.leaves CASCADE;
DROP TABLE IF EXISTS public.office_locations CASCADE;
DROP TABLE IF EXISTS public.project_allocations CASCADE;
DROP TABLE IF EXISTS public.project_team_leads CASCADE;
DROP TABLE IF EXISTS public.request_approvals CASCADE;
DROP TABLE IF EXISTS public.requests CASCADE;
DROP TABLE IF EXISTS public.shift_schedules CASCADE;
DROP TABLE IF EXISTS public.task_entries CASCADE;
DROP TABLE IF EXISTS public.videos CASCADE;
DROP TABLE IF EXISTS public.work_claims CASCADE;
DROP TABLE IF EXISTS public.work_items CASCADE;
DROP TABLE IF EXISTS public.work_sessions CASCADE;

-- Step 2: Remove the 10 contaminated user accounts by exact UUID from user_roles, profiles, and auth.users

DELETE FROM public.user_roles 
WHERE user_id IN (
  '6cde4e1d-088c-40ed-87cd-abc545f4a22f',
  'bac469ba-8de8-41c9-b40b-0ba5f30fcb47',
  'f9cd47c9-bbb8-464c-a112-a2612c626b1a',
  'dd65ddfc-8ced-440c-8dec-51eb80e53c49',
  '3b1e9c29-b08d-48f0-8ac2-7dcbdcaa9b2e',
  '0db43f21-f1b1-4bb3-8c5c-1cc179187408',
  'ccc9093b-5c93-48d1-a52b-35344e0f2d5d',
  '5a878b7e-ccf1-4615-b24d-b16f0ee2733f',
  '7a21f93c-0a26-4aa0-a9f5-bd9a6388c8c3',
  '69ed3eac-a9b0-4bc9-a898-06bc45e67d4d'
);

DELETE FROM public.profiles 
WHERE id IN (
  '6cde4e1d-088c-40ed-87cd-abc545f4a22f',
  'bac469ba-8de8-41c9-b40b-0ba5f30fcb47',
  'f9cd47c9-bbb8-464c-a112-a2612c626b1a',
  'dd65ddfc-8ced-440c-8dec-51eb80e53c49',
  '3b1e9c29-b08d-48f0-8ac2-7dcbdcaa9b2e',
  '0db43f21-f1b1-4bb3-8c5c-1cc179187408',
  'ccc9093b-5c93-48d1-a52b-35344e0f2d5d',
  '5a878b7e-ccf1-4615-b24d-b16f0ee2733f',
  '7a21f93c-0a26-4aa0-a9f5-bd9a6388c8c3',
  '69ed3eac-a9b0-4bc9-a898-06bc45e67d4d'
);

DELETE FROM auth.users 
WHERE id IN (
  '6cde4e1d-088c-40ed-87cd-abc545f4a22f',
  'bac469ba-8de8-41c9-b40b-0ba5f30fcb47',
  'f9cd47c9-bbb8-464c-a112-a2612c626b1a',
  'dd65ddfc-8ced-440c-8dec-51eb80e53c49',
  '3b1e9c29-b08d-48f0-8ac2-7dcbdcaa9b2e',
  '0db43f21-f1b1-4bb3-8c5c-1cc179187408',
  'ccc9093b-5c93-48d1-a52b-35344e0f2d5d',
  '5a878b7e-ccf1-4615-b24d-b16f0ee2733f',
  '7a21f93c-0a26-4aa0-a9f5-bd9a6388c8c3',
  '69ed3eac-a9b0-4bc9-a898-06bc45e67d4d'
);

-- Step 3: Verification Counts
SELECT 'profiles count' AS metric, count(*) FROM public.profiles
UNION ALL
SELECT 'user_roles count', count(*) FROM public.user_roles
UNION ALL
SELECT 'remaining public tables count', count(*) FROM information_schema.tables WHERE table_schema = 'public';
