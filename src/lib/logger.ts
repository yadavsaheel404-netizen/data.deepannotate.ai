import { supabase } from '@/integrations/supabase/client';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface StructuredLog {
  level: LogLevel;
  user_id?: string | null;
  function_name: string;
  error?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Structured logger. Mirrors entries to console (JSON) and persists
 * warn/error rows to public.app_logs for the metrics pipeline.
 */
export async function logEvent(entry: StructuredLog): Promise<void> {
  const payload = {
    ...entry,
    timestamp: new Date().toISOString(),
  };

  // Always log to console as JSON for log aggregators
  const line = JSON.stringify(payload);
  if (entry.level === 'error') console.error(line);
  else if (entry.level === 'warn') console.warn(line);
  else console.log(line);

  // Persist warn/error rows for metrics + alerts
  if (entry.level === 'warn' || entry.level === 'error') {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await (supabase.from('app_logs') as any).insert({
        level: entry.level,
        user_id: entry.user_id ?? user?.id ?? null,
        function_name: entry.function_name,
        error: entry.error ?? null,
        metadata: entry.metadata ?? null,
      });
    } catch (err) {
      // Never throw from logger
      console.warn('logEvent persist failed', err);
    }
  }
}

export const logger = {
  info: (function_name: string, metadata?: Record<string, unknown>) =>
    logEvent({ level: 'info', function_name, metadata }),
  warn: (function_name: string, error?: string, metadata?: Record<string, unknown>) =>
    logEvent({ level: 'warn', function_name, error, metadata }),
  error: (function_name: string, error: string | Error, metadata?: Record<string, unknown>) =>
    logEvent({
      level: 'error',
      function_name,
      error: error instanceof Error ? error.message : error,
      metadata: error instanceof Error ? { ...metadata, stack: error.stack } : metadata,
    }),
};
