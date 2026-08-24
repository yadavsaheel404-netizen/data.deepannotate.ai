import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  Circle,
  History,
  Inbox,
} from 'lucide-react';
import { format } from 'date-fns';
import { fetchTokensHistory, getTokensBalance, TokensTransaction, TokensTxnReason } from '@/services/walletService';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/integrations/supabase/client';
import type { UserProfile } from '@/types/user';

const REASON_LABELS: Record<TokensTxnReason, string> = {
  profile_complete: 'Profile completed',
  profile_incomplete_revoke: 'Profile became incomplete',
  task_reward: 'Task approved',
  tip_sent: 'Tip sent',
  tip_received: 'Tip received',
  admin_adjustment: 'Admin adjustment',
};

interface ProfileField {
  key: string;
  label: string;
  isFilled: (p: UserProfile) => boolean;
}

// Mirrors public.is_profile_complete (9 criteria)
const PROFILE_FIELDS: ProfileField[] = [
  { key: 'display_name', label: 'Display name', isFilled: (p) => !!p.display_name?.trim() },
  { key: 'phone', label: 'Phone number', isFilled: (p) => !!p.phone?.trim() },
  { key: 'avatar_url', label: 'Profile photo', isFilled: (p) => !!p.avatar_url?.trim() },
  { key: 'resume_url', label: 'Resume', isFilled: (p) => !!p.resume_url?.trim() },
  { key: 'linkedin_url', label: 'LinkedIn URL', isFilled: (p) => !!p.linkedin_url?.trim() },
  { key: 'hours_per_week', label: 'Availability', isFilled: (p) => !!p.hours_per_week?.trim() },
  { key: 'language', label: 'At least one language', isFilled: (p) => (p.language?.length ?? 0) >= 1 },
  { key: 'skills', label: 'At least one skill', isFilled: (p) => (p.skills?.length ?? 0) >= 1 },
  { key: 'upi_id', label: 'UPI ID', isFilled: (p) => !!p.upi_id?.trim() },
];

interface Props {
  userId: string;
  totalTokens: number;
  /** Used by the parent to refresh the tokens panel after tip/redeem actions */
  refreshKey?: number;
}

export function TokensDashboard({ userId, totalTokens, refreshKey = 0 }: Props) {
  const profile = useAuthStore((s) => s.profile);
  const fetchProfile = useAuthStore((s) => s.fetchProfile);
  const [txns, setTxns] = useState<TokensTransaction[]>([]);
  const [ledgerBalance, setLedgerBalance] = useState(totalTokens);
  const [loading, setLoading] = useState(true);

  // Initial + parent-triggered refresh
  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([fetchTokensHistory(userId, 50), getTokensBalance(userId)])
      .then(([rows, balance]) => {
        if (!active) return;
        setTxns(rows);
        setLedgerBalance(balance);
      })
      .catch(() => active && setTxns([]))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [userId, refreshKey]);

  // Realtime: any new ledger row for this user → refetch.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`tokens_txn_${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'tokens_transactions',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          fetchTokensHistory(userId, 50).then(setTxns).catch(() => {});
          getTokensBalance(userId).then(setLedgerBalance).catch(() => {});
          fetchProfile(userId);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, fetchProfile]);

  const { filledCount, missing, percent } = useMemo(() => {
    if (!profile) return { filledCount: 0, missing: PROFILE_FIELDS, percent: 0 };
    const filled = PROFILE_FIELDS.filter((f) => f.isFilled(profile));
    const miss = PROFILE_FIELDS.filter((f) => !f.isFilled(profile));
    return {
      filledCount: filled.length,
      missing: miss,
      percent: Math.round((filled.length / PROFILE_FIELDS.length) * 100),
    };
  }, [profile]);

  const isComplete = missing.length === 0;

  return (
    <div className="space-y-4">
      {/* === Tokens header === */}
      <Card className="shadow-card overflow-hidden border-primary/20">
        <CardContent className="p-4 sm:p-5 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-primary/15 grid place-items-center shrink-0">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Your Tokens Balance</p>
              <p className="font-display text-2xl font-bold tabular-nums">
                {ledgerBalance.toLocaleString()} <span className="text-sm font-normal text-muted-foreground">tokens</span>
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-muted-foreground">Recent transactions</p>
            <p className="text-sm font-semibold">{txns.length}</p>
          </div>
        </CardContent>
      </Card>

      {/* === Profile Completion === */}
      <Card className="shadow-card">
        <CardContent className="p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h3 className="text-sm font-semibold">Profile Completion</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {isComplete
                  ? 'All set! You earned bonus tokens for completing your profile.'
                  : 'Complete your profile to earn bonus tokens.'}
              </p>
            </div>
            <Badge
              variant="outline"
              className={`text-xs border-0 ${
                isComplete
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
              }`}
            >
              {filledCount}/{PROFILE_FIELDS.length} ({percent}%)
            </Badge>
          </div>
          <Progress value={percent} className="h-2" />
          {missing.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
                Missing
              </p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {missing.map((f) => (
                  <li key={f.key} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Circle className="h-3 w-3 shrink-0" />
                    <span className="truncate">{f.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {isComplete && (
            <div className="flex items-center gap-2 text-xs text-green-700 dark:text-green-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Profile complete — bonus credited to your wallet</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* === Transaction History === */}
      <Card className="shadow-card">
        <CardContent className="p-0">
          <div className="flex items-center justify-between gap-2 px-4 sm:px-5 py-3 border-b">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Tokens History</h3>
            </div>
            <span className="text-[11px] text-muted-foreground">Latest 50</span>
          </div>

          {loading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 rounded-lg" />
              ))}
            </div>
          ) : txns.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Inbox className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm">No tokens activity yet</p>
              <p className="text-xs mt-1">Complete your profile or tasks to earn tokens</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Activity</TableHead>
                  <TableHead className="text-right">Tokens</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {txns.map((t) => {
                  const isCredit = t.amount > 0;
                  return (
                    <TableRow key={t.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div
                            className={`h-7 w-7 rounded-md grid place-items-center shrink-0 ${
                              isCredit
                                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                            }`}
                          >
                            {isCredit ? (
                              <ArrowUpRight className="h-3.5 w-3.5" />
                            ) : (
                              <ArrowDownRight className="h-3.5 w-3.5" />
                            )}
                          </div>
                          <span className="text-sm font-medium">
                            {REASON_LABELS[t.reason] ?? t.reason}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell
                        className={`text-right font-semibold tabular-nums ${
                          isCredit ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'
                        }`}
                      >
                        {isCredit ? '+' : ''}
                        {t.amount.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground tabular-nums">
                        {t.balance_after.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {format(new Date(t.created_at), 'dd MMM yyyy, HH:mm')}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
