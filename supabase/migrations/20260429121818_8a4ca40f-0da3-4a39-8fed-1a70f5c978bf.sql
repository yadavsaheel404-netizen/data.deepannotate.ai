DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'points_transactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.points_transactions;
  END IF;
END $$;