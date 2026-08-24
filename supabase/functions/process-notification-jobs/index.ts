import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const started = Date.now();
  const results: any[] = [];
  const MAX_BATCHES = 20; // safety: at most 20 batches per invocation
  const BATCH_SIZE = 500;

  for (let i = 0; i < MAX_BATCHES; i++) {
    const { data, error } = await supabase.rpc("process_notification_jobs_batch", {
      _batch_size: BATCH_SIZE,
    });
    if (error) {
      console.error(JSON.stringify({ level: "error", function_name: "process-notification-jobs", error: error.message, timestamp: new Date().toISOString() }));
      return new Response(JSON.stringify({ error: error.message, results }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    results.push(data);
    if (!data || !data.job_id || data.processed === 0) break;
    if (Date.now() - started > 50_000) break;
  }

  console.log(JSON.stringify({ level: "info", function_name: "process-notification-jobs", batches: results.length, duration_ms: Date.now() - started, timestamp: new Date().toISOString() }));

  return new Response(JSON.stringify({ ok: true, batches: results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
