import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { IndianRupee, Wallet, TrendingUp } from 'lucide-react';
import { format } from 'date-fns';
import { formatMoney } from '@/lib/formatMoney';

interface Earning {
  id: string;
  task_id: string;
  amount: number;
  status: string;
  created_at: string;
  task_title?: string;
}

export default function Earnings() {
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const userId = profile?.id || user?.uid;
  const [earnings, setEarnings] = useState<Earning[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('earnings')
        .select('*, projects(title)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      setEarnings(
        ((data ?? []) as any[]).map((r) => ({
          ...r,
          task_id: r.project_id,
          task_title: r.projects?.title ?? 'Unknown Project',
          projects: undefined,
        }))
      );
      setLoading(false);
    })();
  }, [userId]);

  const walletBalance = Number(profile?.wallet_balance ?? 0);
  const totalEarned = Number(profile?.total_earned ?? 0);
  const totalPaid = Number(profile?.total_paid ?? 0);

  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h1 className="font-display text-xl font-bold">My Earnings</h1>
        <p className="text-sm text-muted-foreground">Track your income from completed tasks</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="shadow-card">
          <CardContent className="p-4 flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-primary" />
              <span className="text-xs text-muted-foreground">Balance</span>
            </div>
            <span className="font-display text-xl font-bold">₹{formatMoney(walletBalance)}</span>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-4 flex flex-col gap-1">
          <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <span className="text-xs text-muted-foreground">Total Earned</span>
            </div>
            <span className="font-display text-xl font-bold">₹{formatMoney(totalEarned)}</span>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-4 flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <IndianRupee className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Total Paid</span>
            </div>
            <span className="font-display text-xl font-bold">₹{formatMoney(totalPaid)}</span>
          </CardContent>
        </Card>
      </div>

      {/* Earnings list */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : earnings.length === 0 ? (
        <Card className="shadow-card">
          <CardContent className="p-8 text-center text-muted-foreground text-sm">
            No earnings yet. Complete tasks to start earning!
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {earnings.map((e) => (
            <Card key={e.id} className="shadow-sm">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">{e.task_title}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(e.created_at), 'MMM d, yyyy')}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-display font-bold text-sm">₹{formatMoney(Number(e.amount))}</span>
                  <Badge
                    variant="outline"
                    className={
                      e.status === 'paid'
                        ? 'bg-primary/15 text-primary border-primary/30'
                        : 'bg-warning/15 text-warning border-warning/30'
                    }
                  >
                    {e.status === 'paid' ? 'Paid' : 'Approved'}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
