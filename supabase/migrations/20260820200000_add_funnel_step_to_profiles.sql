-- Migration: Drop unused funnel_step column from public.profiles
ALTER TABLE public.profiles DROP COLUMN IF EXISTS funnel_step;
