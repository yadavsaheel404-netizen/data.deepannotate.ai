import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ClipboardList, CheckCircle2, Clock, IndianRupee, Sparkles, X, ChevronUp, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { AnimatePresence, motion } from 'framer-motion';

type ExpandedPanel = 'tasks' | 'completed' | 'in_progress' | 'wallet' | null;

interface DashboardStats {
  totalAssigned: number;
  completed: number;
  inProgress: number;
  totalEarnings: number;
}

interface SubRow {
  id: string;
  task_title: string;
  media_type: string;
  status: string;
  created_at: string;
}

interface EarningRow {
  id: string;
  task_title: string;
  amount: number;
  status: string;
  created_at: string;
}

export default function ContributorDashboard() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [expanded, setExpanded] = useState<ExpandedPanel>(null);
  const [panelData, setPanelData] = useState<SubRow[] | EarningRow[]>([]);
  const [panelLoading, setPanelLoading] = useState(false);

  const showBanner = profile && !profile.profile_completed && !bannerDismissed;

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      try {
        const { data: submissions } = await supabase
          .from('tasks')
          .select('id, status, project_id')
          .eq('user_id', user.id);

        const subs = (submissions ?? []) as any[];
        const approvedProjectIds = [...new Set(subs.filter((s) => s.status === 'approved').map((s) => s.project_id))];

        let totalEarnings = 0;
        if (approvedProjectIds.length > 0) {
          const { data: projects } = await supabase
            .from('projects')
            .select('id, pay_per_task')
            .in('id', approvedProjectIds);
          totalEarnings = ((projects ?? []) as any[]).reduce((sum, t) => sum + (Number(t.pay_per_task) || 0), 0);
        }

        setStats({
          totalAssigned: subs.length,
          completed: subs.filter((s) => s.status === 'approved').length,
          inProgress: subs.filter((s) => s.status === 'in_review').length,
          totalEarnings,
        });
      } catch {
        setStats({ totalAssigned: 0, completed: 0, inProgress: 0, totalEarnings: 0 });
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  const fetchSubmissions = async (status: string) => {
    if (!user) return;
    setPanelLoading(true);
    try {
      const { data } = await supabase
        .from('tasks')
        .select('id, status, created_at, project_id, projects(title, media_type)')
        .eq('user_id', user.id)
        .eq('status', status as any)
        .order('created_at', { ascending: false });

      setPanelData(
        ((data ?? []) as any[]).map((r) => ({
          id: r.id,
          task_title: r.projects?.title ?? 'Unknown Project',
          media_type: r.projects?.media_type ?? 'text',
          status: r.status,
          created_at: r.created_at,
        })),
      );
    } catch {
      setPanelData([]);
    } finally {
      setPanelLoading(false);
    }
  };

  const fetchEarnings = async () => {
    if (!user) return;
    setPanelLoading(true);
    try {
      const { data } = await supabase
        .from('earnings')
        .select('id, amount, status, created_at, project_id, projects(title)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      setPanelData(
        ((data ?? []) as any[]).map((r) => ({
          id: r.id,
          task_title: r.projects?.title ?? 'Unknown Project',
          amount: Number(r.amount),
          status: r.status,
          created_at: r.created_at,
        })),
      );
    } catch {
      setPanelData([]);
    } finally {
      setPanelLoading(false);
    }
  };

  const handleCardClick = (panel: ExpandedPanel) => {
    if (panel === 'wallet') {
      navigate('/app/wallet');
      return;
    }
    if (panel === 'tasks') {
      navigate('/app/tasks');
      return;
    }
    if (panel === 'completed') {
      navigate('/app/submissions?filter=approved');
      return;
    }
    if (panel === 'in_progress') {
      navigate('/app/submissions?filter=pending');
      return;
    }
  };

  const walletBalance = Number(profile?.wallet_balance ?? 0);

  const cards = stats
    ? [
        { label: 'Total Tasks', value: stats.totalAssigned, icon: ClipboardList, color: 'text-primary', panel: 'tasks' as ExpandedPanel },
        { label: 'Tasks Completed', value: stats.completed, icon: CheckCircle2, color: 'text-primary', panel: 'completed' as ExpandedPanel },
        { label: 'Tasks In Review', value: stats.inProgress, icon: Clock, color: 'text-accent', panel: 'in_progress' as ExpandedPanel },
        { label: 'Wallet Balance', value: `₹${walletBalance.toLocaleString('en-IN')}`, icon: IndianRupee, color: 'text-primary', panel: 'wallet' as ExpandedPanel },
      ]
    : [];

  const panelTitle = expanded === 'completed' ? 'Completed Tasks' : expanded === 'in_progress' ? 'Tasks In Review' : 'Earnings';

  const statusBadge = (status: string) => {
    const map: Record<string, { label: string; className: string }> = {
      approved: { label: 'Approved', className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
      paid: { label: 'Paid', className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
      pending: { label: 'In Review', className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
    };
    const s = map[status] ?? { label: status, className: 'bg-muted text-muted-foreground' };
    return <Badge variant="outline" className={`text-[10px] px-1.5 py-0 border-0 ${s.className}`}>{s.label}</Badge>;
  };

  const isEarnings = expanded === 'wallet';

  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h1 className="font-display text-xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Your contribution overview</p>
      </div>

      {showBanner && (
        <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4 relative">
          <Sparkles className="h-5 w-5 text-primary shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">Start earning — complete your profile first!</p>
            <Link to="/complete-profile" className="text-xs font-medium text-primary hover:underline">
              Complete Profile →
            </Link>
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setBannerDismissed(true)}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
          : cards.map((c) => {
              const isActive = expanded === c.panel && c.panel !== null;
              return (
                <Card
                  key={c.label}
                  onClick={() => c.panel !== null && handleCardClick(c.panel)}
                  className={`shadow-card overflow-hidden transition-all duration-200 hover:scale-[1.02] hover:shadow-md ${
                    c.panel !== null ? 'cursor-pointer' : ''
                  } ${isActive ? 'ring-2 ring-primary/50' : ''}`}
                >
                  <CardContent className="p-4 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">{c.label}</span>
                      {isActive ? (
                        <ChevronUp className={`h-4 w-4 ${c.color}`} />
                      ) : (
                        <c.icon className={`h-4 w-4 ${c.color}`} />
                      )}
                    </div>
                    <span className="font-display text-2xl font-bold">{c.value}</span>
                  </CardContent>
                </Card>
              );
            })}
      </div>

      <AnimatePresence mode="wait">
        {expanded && (
          <motion.div
            key={expanded}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <Card className="shadow-card">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold">{panelTitle}</h2>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setExpanded(null)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {panelLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-14 rounded-lg" />
                    ))}
                  </div>
                ) : panelData.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                    <FileText className="h-8 w-8 mb-2 opacity-40" />
                    <p className="text-sm">No data available</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {panelData.map((row: any) => (
                      <div
                        key={row.id}
                        className="flex items-center justify-between rounded-lg border bg-muted/30 p-3"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{row.task_title}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {!isEarnings && (
                              <span className="text-[10px] text-muted-foreground capitalize">{row.media_type}</span>
                            )}
                            {isEarnings && (
                              <span className="text-xs font-semibold text-foreground">₹{Number(row.amount).toLocaleString('en-IN')}</span>
                            )}
                            <span className="text-[10px] text-muted-foreground">
                              {format(new Date(row.created_at), 'dd MMM yyyy')}
                            </span>
                          </div>
                        </div>
                        {statusBadge(row.status)}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
