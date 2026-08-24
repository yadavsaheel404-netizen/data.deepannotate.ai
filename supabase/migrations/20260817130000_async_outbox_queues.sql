-- Initialize PGMQ queues for asynchronous outbox events (notifications and exports)
DO $$ 
BEGIN 
  PERFORM pgmq.create('notifications'); 
EXCEPTION 
  WHEN OTHERS THEN NULL; 
END $$;

DO $$ 
BEGIN 
  PERFORM pgmq.create('exports'); 
EXCEPTION 
  WHEN OTHERS THEN NULL; 
END $$;

DO $$ 
BEGIN 
  PERFORM pgmq.create('notifications_dlq'); 
EXCEPTION 
  WHEN OTHERS THEN NULL; 
END $$;

DO $$ 
BEGIN 
  PERFORM pgmq.create('exports_dlq'); 
EXCEPTION 
  WHEN OTHERS THEN NULL; 
END $$;
