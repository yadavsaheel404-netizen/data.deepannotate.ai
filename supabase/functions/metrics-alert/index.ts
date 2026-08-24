// Structured logger + alert dispatcher.
// Runs every 5 minutes via pg_cron. Computes metrics over the last hour and
// posts an alert to SLACK_WEBHOOK_URL when thresholds are exceeded.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function logJson(level: string, payload: Record<string, unknown>) {
  console.log(JSON.stringify({
    level,
    function_name: "metrics-alert",
    timestamp: new Date().toISOString(),
    ...payload,
  }));
}

const THRESHOLDS = {
  api_errors: 10,        // > 10 errors per hour triggers alert
  payout_failures: 5,    // > 5 rejected withdrawals per hour
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  try {
    const [{ count: submissions }, { count: approvals }, { count: payoutFailures }, { count: apiErrors }] = await Promise.all([
      supabase.from("tasks").select("*", { count: "exact", head: true }).gte("created_at", since),
      supabase.from("submission_status_audit").select("*", { count: "exact", head: true }).gte("created_at", since).eq("after_status", "approved"),
      supabase.from("withdraw_requests").select("*", { count: "exact", head: true }).gte("created_at", since).eq("status", "rejected"),
      supabase.from("app_logs").select("*", { count: "exact", head: true }).gte("created_at", since).eq("level", "error"),
    ]);

    const metrics = {
      submissions_per_hour: submissions ?? 0,
      approvals_per_hour: approvals ?? 0,
      payout_failures: payoutFailures ?? 0,
      api_errors: apiErrors ?? 0,
    };

    logJson("info", { metrics });

    const breaches: string[] = [];
    if (metrics.api_errors > THRESHOLDS.api_errors) {
      breaches.push(`🚨 API errors: ${metrics.api_errors} (>${THRESHOLDS.api_errors})`);
    }
    if (metrics.payout_failures > THRESHOLDS.payout_failures) {
      breaches.push(`💸 Payout failures: ${metrics.payout_failures} (>${THRESHOLDS.payout_failures})`);
    }

    let alerted = false;
    if (breaches.length > 0) {
      const slackUrl = Deno.env.get("SLACK_WEBHOOK_URL");
      if (slackUrl) {
        const text = [
          "*DataForge metrics alert (last 1h)*",
          ...breaches,
          `Submissions: ${metrics.submissions_per_hour} • Approvals: ${metrics.approvals_per_hour}`,
        ].join("\n");
        const r = await fetch(slackUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (!r.ok) {
          logJson("error", { error: "SLACK_POST_FAILED", status: r.status });
        } else {
          alerted = true;
        }
      } else {
        logJson("warn", { error: "SLACK_WEBHOOK_URL_NOT_SET", breaches });
      }
    }

    return new Response(JSON.stringify({ ok: true, metrics, breaches, alerted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    logJson("error", { error: "UNCAUGHT", message: (err as Error).message });
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
