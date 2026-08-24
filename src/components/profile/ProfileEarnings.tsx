import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Wallet, TrendingUp, IndianRupee, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { formatMoney } from '@/lib/formatMoney';
import type { UserProfile } from '@/types/user';

interface EarningRow {
  id: string;
  task_title: string;
  amount: number;
  status: string;
  created_at: string;
}

interface Props {
  userId?: string;
  profile: UserProfile | null;
}

export default function ProfileEarnings({ userId, profile }: Props) {
  const [earnings, setEarnings] = useState<EarningRow[]>([]);
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
          id: r.id,
          task_title: r.projects?.title ?? 'Unknown Project',
          amount: Number(r.amount),
          status: r.status,
          created_at: r.created_at,
        }))
      );
      setLoading(false);
    })();
  }, [userId]);

  const walletBalance = Number(profile?.wallet_balance ?? 0);
  const totalEarned = Number(profile?.total_earned ?? 0);
  const totalPaid = Number(profile?.total_paid ?? 0);

  const statusBadge = (status: string) => {
    if (status === 'paid') {
      return <Badge variant="outline" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-0 text-[10px]">Paid</Badge>;
    }
    return <Badge variant="outline" className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border-0 text-[10px]">Approved</Badge>;
  };

  return (
    <Card className="shadow-card">
      <CardContent className="p-6 space-y-4">
        <h2 className="font-display text-base font-semibold">Earnings & Wallet</h2>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border bg-muted/30 p-3 flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <Wallet className="h-3.5 w-3.5 text-primary" />
              <span className="text-[10px] text-muted-foreground">Balance</span>
            </div>
            <span className="font-display text-lg font-bold">₹{formatMoney(walletBalance)}</span>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3 flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-primary" />
              <span className="text-[10px] text-muted-foreground">Earned</span>
            </div>
            <span className="font-display text-lg font-bold">₹{formatMoney(totalEarned)}</span>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3 flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <IndianRupee className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">Paid</span>
            </div>
            <span className="font-display text-lg font-bold">₹{formatMoney(totalPaid)}</span>
          </div>
        </div>

        {/* Earnings history */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">Earnings History</h3>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 rounded-lg" />
              ))}
            </div>
          ) : earnings.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
              <FileText className="h-7 w-7 mb-2 opacity-40" />
              <p className="text-sm">No earnings yet</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {earnings.map((e) => (
                <div key={e.id} className="flex items-center justify-between rounded-lg border bg-muted/30 p-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{e.task_title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs font-semibold">₹{formatMoney(e.amount)}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {format(new Date(e.created_at), 'dd MMM yyyy')}
                      </span>
                    </div>
                  </div>
                  {statusBadge(e.status)}
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
