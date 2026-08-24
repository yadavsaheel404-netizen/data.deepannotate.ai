// Admin-only: Export contributors with full stats as filtered CSV-ready data.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Filters {
  search?: string;
  country?: string;
  role?: string;
  status?: string; // 'active' | 'inactive' | 'all'
  projectId?: string; // task id
  dateFrom?: string;
  dateTo?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Authenticate caller and verify admin role
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const filters: Filters = await req.json().catch(() => ({}));

    // Fetch all roles + profiles
    const [{ data: roles }, { data: profiles }] = await Promise.all([
      admin.from("user_roles").select("user_id, role"),
      admin.from("profiles").select(
        "id, display_name, email, country, skills, current_status, is_active, onboarding_complete, created_at, wallet_balance, total_earned, total_paid",
      ),
    ]);
    const roleMap = new Map((roles ?? []).map((r) => [r.user_id, r.role]));
    let users = (profiles ?? []).map((p) => ({
      ...p,
      role: roleMap.get(p.id) ?? "contributor",
    }));

    // Apply user-level filters
    if (filters.country && filters.country !== "all") {
      users = users.filter((u) => u.country === filters.country);
    }
    if (filters.role && filters.role !== "all") {
      users = users.filter((u) => u.role === filters.role);
    }
    if (filters.status && filters.status !== "all") {
      users = users.filter((u) => (filters.status === "active" ? u.is_active : !u.is_active));
    }
    if (filters.dateFrom) {
      const from = new Date(filters.dateFrom).getTime();
      users = users.filter((u) => new Date(u.created_at).getTime() >= from);
    }
    if (filters.dateTo) {
      const to = new Date(filters.dateTo).getTime() + 86400000;
      users = users.filter((u) => new Date(u.created_at).getTime() <= to);
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      users = users.filter((u) => {
        const name = (u.display_name ?? "").toLowerCase();
        const country = (u.country ?? "").toLowerCase();
        const skills = (u.skills ?? []).join(" ").toLowerCase();
        return name.includes(q) || country.includes(q) || skills.includes(q);
      });
    }

    if (users.length === 0) {
      return new Response(JSON.stringify({ rows: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userIds = users.map((u) => u.id);

    // Fetch emails as fallback only when missing on profile (prefer profiles.email)
    const missingEmailIds = users.filter((u) => !(u as any).email).map((u) => u.id);
    const emailMap = new Map<string, string>();
    if (missingEmailIds.length > 0) {
      let page = 1;
      while (true) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) break;
        for (const u of data.users) emailMap.set(u.id, u.email ?? "");
        if (!data.users.length || data.users.length < 1000) break;
        page++;
        if (page > 20) break;
      }
    }

    // Fetch tasks (submissions) + projects + earnings + withdrawals in parallel
    const [{ data: submissions }, { data: tasks }, { data: earnings }, { data: withdrawals }] =
      await Promise.all([
        admin
          .from("tasks")
          .select("id, user_id, project_id, status, created_at")
          .in("user_id", userIds),
        admin.from("projects").select("id, title"),
        admin.from("earnings").select("user_id, project_id, amount, status").in("user_id", userIds),
        admin.from("withdraw_requests").select("user_id, amount, status").in("user_id", userIds),
      ]);

    const taskTitleMap = new Map((tasks ?? []).map((t) => [t.id, t.title]));

    // Optional project filter on submissions
    let subs = submissions ?? [];
    if (filters.projectId && filters.projectId !== "all") {
      subs = subs.filter((s) => s.project_id === filters.projectId);
      const allowedUserIds = new Set(subs.map((s) => s.user_id));
      users = users.filter((u) => allowedUserIds.has(u.id));
    }

    // Aggregate per user
    const rows = users.map((u) => {
      const userSubs = subs.filter((s) => s.user_id === u.id);
      const approved = userSubs.filter((s) => s.status === "approved");
      const rejected = userSubs.filter((s) => s.status === "rejected");
      const inReview = userSubs.filter((s) => s.status === "pending");
      const total = userSubs.length;
      const approvalRate = total > 0 ? Math.round((approved.length / total) * 1000) / 10 : 0;

      const userEarnings = (earnings ?? []).filter((e) => e.user_id === u.id);
      const totalEarnedComputed = userEarnings
        .filter((e) => e.status === "approved")
        .reduce((s, e) => s + Number(e.amount || 0), 0);

      const userWithdrawals = (withdrawals ?? []).filter((w) => w.user_id === u.id);
      const pendingPayouts = userWithdrawals
        .filter((w) => w.status === "pending" || w.status === "approved")
        .reduce((s, w) => s + Number(w.amount || 0), 0);

      // Project-wise grouping (only approved)
      const projectStats = new Map<string, { count: number; earnings: number }>();
      for (const e of userEarnings.filter((e) => e.status === "approved")) {
        const cur = projectStats.get(e.project_id) ?? { count: 0, earnings: 0 };
        cur.count += 1;
        cur.earnings += Number(e.amount || 0);
        projectStats.set(e.project_id, cur);
      }
      const projectsBreakdown = Array.from(projectStats.entries())
        .map(([projectId, s]) => `${taskTitleMap.get(projectId) ?? "Unknown"} (${s.count} tasks, ₹${s.earnings})`)
        .join(" | ");

      return {
        name: u.display_name || "Unnamed",
        email: (u as any).email || emailMap.get(u.id) || "",
        country: u.country || "",
        joined_date: new Date(u.created_at).toISOString().slice(0, 10),
        role: u.role,
        status: u.is_active ? "Active" : "Inactive",
        skills: (u.skills ?? []).join("; "),
        current_status: u.current_status || "",
        total_submissions: total,
        approved_count: approved.length,
        rejected_count: rejected.length,
        in_review_count: inReview.length,
        approval_rate_pct: approvalRate,
        total_earned: totalEarnedComputed,
        total_paid: Number(u.total_paid || 0),
        pending_payouts: pendingPayouts,
        wallet_balance: Number(u.wallet_balance || 0),
        projects_breakdown: projectsBreakdown,
      };
    });

    return new Response(JSON.stringify({ rows }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("export-contributors error", e);
    return new Response(JSON.stringify({ error: String((e as Error)?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
