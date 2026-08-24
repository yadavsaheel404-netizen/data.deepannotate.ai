import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { startOfDay, endOfDay } from 'date-fns';
import {
  ListTodo,
  ClipboardCheck,
  Wallet,
  BarChart3,
  CheckCircle2,
  AlertTriangle,
  IndianRupee,
  Users,
  Plus,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// Operational thresholds
const PENDING_REVIEW_WARN = 20;
const PENDING_WITHDRAW_AMOUNT_CRITICAL = 10000; // ₹10,000
const REJECTION_RATE_ALERT = 40; // %

async function fetchDashboard() {
  const todayStart = startOfDay(new Date()).toISOString();
  const todayEnd = endOfDay(new Date()).toISOString();

  const [projectsRes, tasksAllRes, tasksTodayRes, withdrawalsRes, payoutsTodayRes] =
    await Promise.all([
      supabase.from('projects').select('id, title, status'),
      supabase.from('tasks').select('id, status, project_id'),
      supabase
        .from('tasks')
        .select('id, status, user_id, project_id, updated_at, created_at')
        .gte('created_at', todayStart)
        .lte('created_at', todayEnd),
      supabase.from('withdraw_requests').select('id, amount, status'),
      supabase
        .from('withdraw_requests')
        .select('amount, processed_at, status')
        .eq('status', 'paid')
        .gte('processed_at', todayStart)
        .lte('processed_at', todayEnd),
    ]);

  const projects = projectsRes.data ?? [];
  const allTasks = tasksAllRes.data ?? [];
  const tasksToday = tasksTodayRes.data ?? [];
  const withdrawals = withdrawalsRes.data ?? [];
  const payoutsToday = payoutsTodayRes.data ?? [];

  const activeProjects = projects.filter((p) => p.status === 'active').length;
  const pendingReviews = allTasks.filter((t) => t.status === 'in_review').length;

  const pendingWithdrawals = withdrawals.filter(
    (w) => w.status === 'pending' || w.status === 'approved'
  );
  const pendingWithdrawAmount = pendingWithdrawals.reduce(
    (s, w) => s + Number(w.amount ?? 0),
    0
  );

  const reviewedToday = tasksToday.filter(
    (t) => t.status === 'approved' || t.status === 'rejected'
  );
  const approvedToday = reviewedToday.filter((t) => t.status === 'approved').length;
  const rejectedToday = reviewedToday.filter((t) => t.status === 'rejected').length;
  const approvalRateToday =
    reviewedToday.length > 0 ? Math.round((approvedToday / reviewedToday.length) * 100) : null;

  const totalPayoutsToday = payoutsToday.reduce((s, p) => s + Number(p.amount ?? 0), 0);
  const activeContributorsToday = new Set(tasksToday.map((t) => t.user_id)).size;

  // Per-project rejection alerts (need >= 5 reviewed today)
  const projectMap = new Map(projects.map((p) => [p.id, p.title]));
  const perProject = new Map<string, { approved: number; rejected: number }>();
  reviewedToday.forEach((t) => {
    const b = perProject.get(t.project_id) ?? { approved: 0, rejected: 0 };
    if (t.status === 'approved') b.approved += 1;
    if (t.status === 'rejected') b.rejected += 1;
    perProject.set(t.project_id, b);
  });
  const rejectionAlerts: { title: string; rate: number }[] = [];
  perProject.forEach((b, pid) => {
    const total = b.approved + b.rejected;
    if (total >= 5) {
      const rate = Math.round((b.rejected / total) * 100);
      if (rate >= REJECTION_RATE_ALERT) {
        rejectionAlerts.push({
          title: (projectMap.get(pid) as string) ?? 'Unknown project',
          rate,
        });
      }
    }
  });

  return {
    activeProjects,
    pendingReviews,
    pendingWithdrawCount: pendingWithdrawals.length,
    pendingWithdrawAmount,
    tasksSubmittedToday: tasksToday.length,
    approvalRateToday,
    rejectedToday,
    totalReviewedToday: reviewedToday.length,
    totalPayoutsToday,
    activeContributorsToday,
    rejectionAlerts,
  };
}

export default function AdminDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: fetchDashboard,
    refetchInterval: 60_000,
  });

  if (isLoading || !data) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const rejectionRateToday =
    data.totalReviewedToday > 0
      ? Math.round((data.rejectedToday / data.totalReviewedToday) * 100)
      : 0;
  const rejectionSpike = data.totalReviewedToday >= 5 && rejectionRateToday >= REJECTION_RATE_ALERT;
  const reviewsHigh = data.pendingReviews >= PENDING_REVIEW_WARN;
  const withdrawalsCritical = data.pendingWithdrawAmount >= PENDING_WITHDRAW_AMOUNT_CRITICAL;

  const topCards = [
    {
      label: 'Active Projects',
      value: data.activeProjects,
      icon: ListTodo,
      tone: 'default' as const,
    },
    {
      label: 'Pending Reviews',
      value: data.pendingReviews,
      icon: ClipboardCheck,
      tone: reviewsHigh ? ('warning' as const) : ('default' as const),
      hint: reviewsHigh ? 'Backlog growing' : undefined,
    },
    {
      label: 'Pending Withdrawals',
      value: `₹${data.pendingWithdrawAmount.toLocaleString('en-IN')}`,
      sub: `${data.pendingWithdrawCount} request${data.pendingWithdrawCount === 1 ? '' : 's'}`,
      icon: Wallet,
      tone: withdrawalsCritical ? ('critical' as const) : ('default' as const),
    },
    {
      label: 'Tasks Submitted Today',
      value: data.tasksSubmittedToday,
      icon: BarChart3,
      tone: 'default' as const,
    },
  ];

  const insightCards = [
    {
      label: 'Approval Rate (Today)',
      value: data.approvalRateToday !== null ? `${data.approvalRateToday}%` : '—',
      sub:
        data.totalReviewedToday > 0
          ? `${data.totalReviewedToday} reviewed`
          : 'No reviews yet',
      icon: CheckCircle2,
      tone: 'default' as const,
    },
    {
      label: 'Rejection Rate (Today)',
      value: `${rejectionRateToday}%`,
      sub: rejectionSpike ? 'Above threshold ⚠️' : 'Within normal range',
      icon: AlertTriangle,
      tone: rejectionSpike ? ('warning' as const) : ('default' as const),
    },
    {
      label: 'Total Payouts Today',
      value: `₹${data.totalPayoutsToday.toLocaleString('en-IN')}`,
      icon: IndianRupee,
      tone: 'default' as const,
    },
    {
      label: 'Active Contributors Today',
      value: data.activeContributorsToday,
      icon: Users,
      tone: 'default' as const,
    },
  ];

  const alerts: { title: string; description: string; href: string; tone: 'critical' | 'warning' }[] =
    [];
  if (withdrawalsCritical) {
    alerts.push({
      title: 'High pending withdrawal balance',
      description: `₹${data.pendingWithdrawAmount.toLocaleString('en-IN')} across ${
        data.pendingWithdrawCount
      } request${data.pendingWithdrawCount === 1 ? '' : 's'} awaiting action.`,
      href: '/admin/withdrawals',
      tone: 'critical',
    });
  }
  if (reviewsHigh) {
    alerts.push({
      title: 'Review backlog building up',
      description: `${data.pendingReviews} submissions are waiting for review.`,
      href: '/admin/review',
      tone: 'warning',
    });
  }
  data.rejectionAlerts.forEach((a) => {
    alerts.push({
      title: `High rejection rate in "${a.title}"`,
      description: `${a.rate}% of today's reviewed submissions were rejected.`,
      href: '/admin/review',
      tone: 'warning',
    });
  });

  return (
    <div className="space-y-6 animate-slide-up bg-[#F7F9FA]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#0A1628]">Admin Dashboard</h1>
          <p className="text-sm text-[#6B7280]">
            Live operational snapshot — refreshes every minute
          </p>
        </div>
        <Button variant="ghost" size="sm" asChild className="text-[#0A1628] hover:bg-slate-100">
          <Link to="/admin/analytics" className="gap-1 font-semibold">
            View deep analytics <ArrowRight className="h-4 w-4 text-[#06B6D4]" />
          </Link>
        </Button>
      </div>

      {/* Top operational cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {topCards.map((c, i) => (
          <StatCard key={c.label} {...c} isHero={i === 0} />
        ))}
      </div>

      {/* Quick insights */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {insightCards.map((c) => (
          <StatCard key={c.label} {...c} />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Quick Actions */}
        <Card className="bg-white border border-[#E5E7EB] shadow-none lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold text-[#0A1628]">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2.5">
            {/* Primary Action Button */}
            <Button asChild className="justify-between bg-[#0A1628] text-white hover:bg-[#050C16] font-semibold border-none">
              <Link to="/admin/create-task">
                <span className="flex items-center gap-2">
                  <Plus className="h-4 w-4 text-[#06B6D4]" /> Create New Project
                </span>
              </Link>
            </Button>
            {/* Secondary Action Buttons */}
            <Button asChild variant="outline" className="justify-between bg-white border border-[#E5E7EB] text-[#0A1628] hover:bg-slate-50 font-medium">
              <Link to="/admin/review">
                <span className="flex items-center gap-2">
                  <ClipboardCheck className="h-4 w-4 text-[#06B6D4]" /> Review Tasks
                </span>
                {data.pendingReviews > 0 && (
                  <Badge className="bg-[rgba(6,182,212,0.12)] text-[#06B6D4] hover:bg-[rgba(6,182,212,0.15)] border-none">
                    {data.pendingReviews}
                  </Badge>
                )}
              </Link>
            </Button>
            <Button asChild variant="outline" className="justify-between bg-white border border-[#E5E7EB] text-[#0A1628] hover:bg-slate-50 font-medium">
              <Link to="/admin/withdrawals">
                <span className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-[#06B6D4]" /> Process Withdrawals
                </span>
                {data.pendingWithdrawCount > 0 && (
                  <Badge className={withdrawalsCritical ? 'bg-rose-100 text-rose-700 border-none' : 'bg-[rgba(6,182,212,0.12)] text-[#06B6D4] border-none'}>
                    {data.pendingWithdrawCount}
                  </Badge>
                )}
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Alerts */}
        <Card className="bg-white border border-[#E5E7EB] shadow-none lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold text-[#0A1628]">Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            {alerts.length === 0 ? (
              <div className="flex items-center gap-2 rounded-lg border border-[#06B6D4]/20 bg-[rgba(6,182,212,0.08)] p-4 text-sm text-[#06B6D4] font-medium">
                <CheckCircle2 className="h-4 w-4 text-[#06B6D4]" />
                All systems normal. No alerts right now.
              </div>
            ) : (
              <ul className="space-y-2">
                {alerts.map((a, i) => (
                  <li key={i}>
                    <Link
                      to={a.href}
                      className={cn(
                        'flex items-start justify-between gap-3 rounded-lg border p-3 transition-colors',
                        a.tone === 'critical'
                          ? 'border-rose-200 bg-rose-50/50 hover:bg-rose-50'
                          : 'border-amber-200 bg-amber-50/50 hover:bg-amber-50'
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <AlertTriangle
                          className={cn(
                            'mt-0.5 h-4 w-4 shrink-0',
                            a.tone === 'critical' ? 'text-rose-600' : 'text-amber-600'
                          )}
                        />
                        <div>
                          <p className="text-sm font-semibold text-[#0A1628]">{a.title}</p>
                          <p className="text-xs text-[#6B7280]">{a.description}</p>
                        </div>
                      </div>
                      <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-[#06B6D4]" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  hint,
  icon: Icon,
  tone,
  isHero,
}: {
  label: string;
  value: string | number;
  sub?: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: 'default' | 'warning' | 'critical';
  isHero?: boolean;
}) {
  const toneClasses =
    tone === 'critical'
      ? 'border-rose-200 bg-rose-50/40'
      : tone === 'warning'
      ? 'border-amber-200 bg-amber-50/40'
      : 'border-[#E5E7EB] bg-white';
  
  const valueColor =
    isHero
      ? 'text-[#06B6D4]'
      : tone === 'critical'
      ? 'text-rose-600'
      : tone === 'warning'
      ? 'text-amber-600'
      : 'text-[#0A1628]';

  return (
    <div className={cn('rounded-xl border p-5 shadow-none', toneClasses)}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#6B7280]">{label}</span>
        <Icon className={cn('h-4 w-4', isHero ? 'text-[#06B6D4]' : 'text-[#06B6D4]')} />
      </div>
      <p className={cn('mt-2 font-display text-3xl font-bold', valueColor)}>{value}</p>
      {(sub || hint) && (
        <p className="mt-1 text-xs text-[#9CA3AF]">{hint ?? sub}</p>
      )}
    </div>
  );
}
