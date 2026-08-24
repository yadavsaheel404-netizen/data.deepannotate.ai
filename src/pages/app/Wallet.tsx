import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Wallet as WalletIcon, TrendingUp, IndianRupee, FileText, ArrowDownToLine, Loader2, AlertCircle, CalendarClock, ChevronDown, Sparkles } from 'lucide-react';
import { TipTokensDialog } from '@/components/app/TipTokensDialog';
import { TokensDashboard } from '@/components/app/TokensDashboard';
import { format, isToday } from 'date-fns';
import { toast } from 'sonner';
import { formatMoney } from '@/lib/formatMoney';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { formatTaskId } from '@/lib/taskId';
import { getTokensBalance } from '@/services/walletService';

interface EarningRow {
  id: string;
  task_id: string;
  project_id: string;
  task_title: string;
  amount: number;
  status: string;
  created_at: string;
}

interface WithdrawRow {
  id: string;
  amount: number;
  status: string;
  created_at: string;
  processed_at: string | null;
  rejection_reason: string | null;
}

interface ProjectBreakdown {
  project_id: string;
  task_title: string;
  total: number;
  count: number;
  tasks: EarningRow[];
}

export default function WalletPage() {
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const fetchProfile = useAuthStore((s) => s.fetchProfile);
  const navigate = useNavigate();
  const [earnings, setEarnings] = useState<EarningRow[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [bankPromptOpen, setBankPromptOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [tipOpen, setTipOpen] = useState(false);
  const [tokensRefreshKey, setTokensRefreshKey] = useState(0);
  const [ledgerTokens, setLedgerTokens] = useState<number | null>(null);
  const refreshTokens = () => setTokensRefreshKey((k) => k + 1);

  const totalTokens = ledgerTokens ?? Number(profile?.total_tokens ?? 0);

  useEffect(() => {
    if (!user?.id) {
      setLedgerTokens(null);
      return;
    }
    getTokensBalance(user.id).then(setLedgerTokens).catch(() => setLedgerTokens(Number(profile?.total_tokens ?? 0)));
  }, [user?.id, tokensRefreshKey, profile?.total_tokens]);

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`wallet_tokens_${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'tokens_transactions', filter: `user_id=eq.${user.id}` },
        () => {
          getTokensBalance(user.id).then(setLedgerTokens).catch(() => {});
          fetchProfile(user.id);
          refreshTokens();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, fetchProfile]);

  // Surface earn/spend toasts when total_tokens changes between renders.
  // Skips the very first render so we don't toast on initial load.
  const prevTokensRef = useRef<number | null>(null);
  useEffect(() => {
    if (prevTokensRef.current === null) {
      prevTokensRef.current = totalTokens;
      return;
    }
    const diff = totalTokens - prevTokensRef.current;
    if (diff > 0) {
      toast.success(`You earned ${diff} tokens`);
      refreshTokens();
    } else if (diff < 0) {
      toast(`Tokens deducted`, { description: `${Math.abs(diff)} tokens removed from your wallet.` });
      refreshTokens();
    }
    prevTokensRef.current = totalTokens;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalTokens]);

  const walletBalance = Number(profile?.wallet_balance ?? 0);
  const totalPaid = Number(profile?.total_paid ?? 0);
  const isPaypalUser = !!(profile as any)?.payout_country && String((profile as any).payout_country).toLowerCase() !== 'india' && String((profile as any).payout_country).toLowerCase() !== 'in';
  const paypalEmail = (profile as any)?.paypal_email ?? null;
  const hasBankDetails = isPaypalUser
    ? !!paypalEmail
    : !!(profile?.upi_id || (profile?.bank_account_number && profile?.ifsc_code));

  // Calculate pending/approved (not yet paid) withdrawal amounts to lock from available balance
  const lockedAmount = withdrawals
    .filter((w) => w.status === 'pending' || w.status === 'approved')
    .reduce((sum, w) => sum + w.amount, 0);
  const availableBalance = Math.max(0, walletBalance - lockedAmount);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [earningsRes, withdrawRes] = await Promise.all([
        supabase
          .from('earnings')
          .select('*, projects(title)')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('withdraw_requests')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
      ]);

      setEarnings(
        ((earningsRes.data ?? []) as any[]).map((r) => ({
          id: r.id,
          task_id: r.task_id,
          project_id: r.project_id,
          task_title: r.projects?.title ?? 'Unknown Project',
          amount: Number(r.amount),
          status: r.status,
          created_at: r.created_at,
        }))
      );

      setWithdrawals(
        ((withdrawRes.data ?? []) as any[]).map((r) => ({
          id: r.id,
          amount: Number(r.amount),
          status: r.status,
          created_at: r.created_at,
          processed_at: r.processed_at,
          rejection_reason: r.rejection_reason ?? null,
        }))
      );
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user]);

  // Derived stats — ONLY from approved earnings
  const approvedEarnings = earnings.filter((e) => e.status === 'approved' || e.status === 'paid');
  const totalApproved = approvedEarnings.reduce((sum, e) => sum + e.amount, 0);
  const todayEarnings = approvedEarnings
    .filter((e) => isToday(new Date(e.created_at)))
    .reduce((sum, e) => sum + e.amount, 0);
  const totalWithdrawn = withdrawals
    .filter((w) => w.status === 'paid')
    .reduce((sum, w) => sum + w.amount, 0);

  // Project-wise breakdown — APPROVED tasks only
  const projectBreakdown: ProjectBreakdown[] = Object.values(
    approvedEarnings.reduce<Record<string, ProjectBreakdown>>((acc, e) => {
      const key = e.project_id;
      if (!acc[key]) acc[key] = { project_id: key, task_title: e.task_title, total: 0, count: 0, tasks: [] };
      acc[key].total += e.amount;
      acc[key].count += 1;
      acc[key].tasks.push(e);
      return acc;
    }, {})
  ).sort((a, b) => b.total - a.total);

  const totalApprovedTasks = approvedEarnings.length;

  const kycVerified = (profile as any)?.kyc_status === 'verified';

  const handleWithdrawClick = () => {
    if (!kycVerified) {
      toast.error('Complete KYC verification before withdrawing', {
        description: 'Go to Profile → Personal → KYC Verification.',
        action: { label: 'Open Profile', onClick: () => navigate('/app/profile') },
      });
      return;
    }
    if (!hasBankDetails) {
      setBankPromptOpen(true);
      return;
    }
    setModalOpen(true);
  };

  const handleWithdraw = async () => {
    if (!user) return;
    const amount = Number(withdrawAmount);
    if (isNaN(amount) || amount < 100) {
      toast.error('Minimum withdrawal is ₹100');
      return;
    }
    if (amount > availableBalance) {
      toast.error('Amount exceeds available balance');
      return;
    }

    setSubmitting(true);
    try {
      // Validate PayPal users have a PayPal email
      if (isPaypalUser && !paypalEmail) {
        toast.error('Please add PayPal email in profile before withdrawing');
        setSubmitting(false);
        return;
      }

      // Snapshot current payment details at request time so future profile edits cannot change historical withdrawals.
      const insertPayload: any = {
        user_id: user.id,
        amount,
        status: 'pending',
        payment_method: isPaypalUser ? 'paypal' : 'india',
      };
      if (isPaypalUser) {
        insertPayload.paypal_email = paypalEmail;
        insertPayload.paypal_email_snapshot = paypalEmail;
      } else {
        insertPayload.upi_id = profile?.upi_id ?? null;
        insertPayload.account_holder_name = profile?.account_holder_name ?? null;
        insertPayload.bank_account_number = profile?.bank_account_number ?? null;
        insertPayload.ifsc_code = profile?.ifsc_code ?? null;
        insertPayload.upi_id_snapshot = profile?.upi_id ?? null;
        insertPayload.account_holder_name_snapshot = profile?.account_holder_name ?? null;
        insertPayload.bank_account_snapshot = profile?.bank_account_number ?? null;
        insertPayload.ifsc_snapshot = profile?.ifsc_code ?? null;
      }
      const { error } = await supabase.from('withdraw_requests').insert(insertPayload);
      if (error) throw error;
      toast.success('Withdrawal request submitted');
      setModalOpen(false);
      setWithdrawAmount('');
      fetchData();
      if (user) fetchProfile(user.id);
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  };

  const statusBadge = (status: string, context: 'earning' | 'withdrawal' = 'earning') => {
    const pendingLabel = context === 'earning' ? 'In Review' : 'Pending';
    const map: Record<string, { label: string; className: string }> = {
      approved: { label: 'Approved', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
      paid: { label: 'Paid', className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
      pending: { label: pendingLabel, className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
      rejected: { label: 'Rejected', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
    };
    const s = map[status] ?? { label: status, className: 'bg-muted text-muted-foreground' };
    return <Badge variant="outline" className={`border-0 text-xs ${s.className}`}>{s.label}</Badge>;
  };

  const hasPendingWithdraw = withdrawals.some((w) => w.status === 'pending');

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-xl font-bold text-[#0A1628]">Wallet</h1>
          <p className="text-sm text-[#6B7280]">Your earnings and withdrawals</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={() => setTipOpen(true)}
            disabled={totalTokens < 10}
            className="gap-1.5 bg-white border-[#E5E7EB] text-[#0A1628] hover:bg-slate-50 font-medium"
            size="sm"
          >
            <Sparkles className="h-4 w-4 text-[#06B6D4]" />
            Tip Tokens
          </Button>
          <Button
            onClick={handleWithdrawClick}
            disabled={availableBalance < 100 || hasPendingWithdraw || !kycVerified}
            className="gap-1.5 bg-[#0A1628] text-white hover:bg-[#050C16] font-semibold border-none"
            size="sm"
            title={!kycVerified ? 'Complete KYC verification to enable withdrawals' : undefined}
          >
            <ArrowDownToLine className="h-4 w-4 text-[#06B6D4]" />
            Withdraw
          </Button>
        </div>
      </div>

      <TipTokensDialog
        open={tipOpen}
        onOpenChange={setTipOpen}
        currentTokens={totalTokens}
        onSuccess={() => { if (user) fetchProfile(user.id); refreshTokens(); }}
      />

      {!kycVerified && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
            <p className="text-xs text-amber-900 font-medium">
              Complete KYC verification to enable withdrawals.
            </p>
          </div>
          <Button size="sm" variant="outline" className="bg-white border-[#E5E7EB] text-[#0A1628]" onClick={() => navigate('/app/profile')}>
            Complete KYC
          </Button>
        </div>
      )}

      {hasPendingWithdraw && (
        <div className="flex items-center gap-2 rounded-xl border border-[#06B6D4]/30 bg-[rgba(6,182,212,0.08)] p-3">
          <AlertCircle className="h-4 w-4 text-[#06B6D4] shrink-0" />
          <p className="text-xs text-[#06B6D4] font-medium">You have a pending withdrawal request. Wait for it to be processed before requesting another.</p>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="bg-white border border-[#E5E7EB] shadow-none rounded-xl">
          <CardContent className="p-4 flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <CalendarClock className="h-4 w-4 text-[#06B6D4]" />
              <span className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider">Today</span>
            </div>
            <span className="font-display text-xl font-bold text-[#0A1628]">₹{formatMoney(todayEarnings)}</span>
          </CardContent>
        </Card>
        <Card className="bg-white border border-[#E5E7EB] shadow-none rounded-xl">
          <CardContent className="p-4 flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4 text-[#06B6D4]" />
              <span className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider">Approved</span>
            </div>
            <span className="font-display text-xl font-bold text-[#0A1628]">₹{formatMoney(totalApproved)}</span>
          </CardContent>
        </Card>
        <Card className="bg-white border border-[#E5E7EB] shadow-none rounded-xl">
          <CardContent className="p-4 flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <IndianRupee className="h-4 w-4 text-[#06B6D4]" />
              <span className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider">Withdrawn</span>
            </div>
            <span className="font-display text-xl font-bold text-[#0A1628]">₹{formatMoney(totalWithdrawn)}</span>
          </CardContent>
        </Card>
        {/* Single Hero Metric: Available Balance */}
        <Card className="bg-white border border-[#E5E7EB] shadow-none rounded-xl">
          <CardContent className="p-4 flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <WalletIcon className="h-4 w-4 text-[#06B6D4]" />
              <span className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider">Balance</span>
            </div>
            <span className="font-display text-xl font-bold text-[#06B6D4]">₹{formatMoney(availableBalance)}</span>
          </CardContent>
        </Card>
      </div>

      {/* Project-wise breakdown — approved (paid) tasks only */}
      {projectBreakdown.length > 0 && (
        <Card className="shadow-card overflow-hidden">
          <CardContent className="p-3 sm:p-4 space-y-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">Project-wise Earnings</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">Showing approved (paid) tasks only</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[11px] text-muted-foreground">Total Earned</p>
                <p className="text-sm font-bold tabular-nums">
                  ₹{formatMoney(totalApproved)}{' '}
                  <span className="text-[11px] font-normal text-muted-foreground">
                    · {totalApprovedTasks} task{totalApprovedTasks !== 1 ? 's' : ''}
                  </span>
                </p>
              </div>
            </div>
            <Accordion type="multiple" className="space-y-2">
              {projectBreakdown.map((p) => (
                <AccordionItem
                  key={p.project_id}
                  value={p.project_id}
                  className="rounded-lg border bg-muted/30 px-3 border-b"
                >
                  <AccordionTrigger className="py-3 hover:no-underline gap-3">
                    <div className="flex items-center justify-between gap-3 flex-1 min-w-0">
                      <div className="min-w-0 flex-1 text-left">
                        <p
                          className="text-sm font-medium break-words"
                          style={{
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            wordBreak: 'break-word',
                          }}
                        >
                          {p.task_title}
                        </p>
                        <p className="text-xs text-muted-foreground font-normal mt-0.5">
                          {p.count} approved task{p.count !== 1 ? 's' : ''}
                        </p>
                      </div>
                      <span className="text-sm font-bold shrink-0 tabular-nums">₹{formatMoney(p.total)}</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-3 pt-0">
                    <div className="space-y-1.5 border-t pt-2">
                      {p.tasks.map((t) => (
                        <div
                          key={t.id}
                          className="flex items-center justify-between gap-2 rounded-md bg-background/60 px-2.5 py-2"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-mono text-[11px] font-semibold tracking-wide truncate">
                              {formatTaskId(t.task_id)}
                            </p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              {format(new Date(t.created_at), 'dd MMM yyyy')}
                            </p>
                          </div>
                          <Badge
                            variant="outline"
                            className="border-0 text-[10px] bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 shrink-0"
                          >
                            Approved
                          </Badge>
                          <span className="text-sm font-semibold shrink-0 tabular-nums">
                            ₹{formatMoney(t.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
      )}

      {/* Tabs: tokens dashboard, earnings, withdrawals */}
      <Tabs defaultValue="points">
        <TabsList className="w-full grid grid-cols-3">
          <TabsTrigger value="points">Tokens</TabsTrigger>
          <TabsTrigger value="earnings">Earnings</TabsTrigger>
          <TabsTrigger value="withdrawals">Withdrawals</TabsTrigger>
        </TabsList>

        <TabsContent value="points">
          {user && (
            <TokensDashboard
              userId={user.id}
              totalTokens={totalTokens}
              refreshKey={tokensRefreshKey}
            />
          )}
        </TabsContent>


        <TabsContent value="earnings">
          <Card className="shadow-card">
            <CardContent className="p-0">
              {loading ? (
                <div className="p-4 space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
                </div>
              ) : earnings.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <FileText className="h-8 w-8 mb-2 opacity-40" />
                  <p className="text-sm">No earnings yet</p>
                  <p className="text-xs mt-1">Complete tasks to start earning</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Task</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {earnings.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="font-medium">{e.task_title}</TableCell>
                        <TableCell className="text-right font-semibold">₹{formatMoney(e.amount)}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{format(new Date(e.created_at), 'dd MMM yyyy')}</TableCell>
                        <TableCell>{statusBadge(e.status)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="withdrawals">
          <Card className="shadow-card">
            <CardContent className="p-0">
              {loading ? (
                <div className="p-4 space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
                </div>
              ) : withdrawals.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <ArrowDownToLine className="h-8 w-8 mb-2 opacity-40" />
                  <p className="text-sm">No withdrawal requests yet</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Amount</TableHead>
                      <TableHead>Requested</TableHead>
                      <TableHead>Processed</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {withdrawals.flatMap((w) => {
                      const rows = [
                        <TableRow key={w.id}>
                          <TableCell className="font-semibold">₹{formatMoney(w.amount)}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">{format(new Date(w.created_at), 'dd MMM yyyy')}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {w.processed_at ? format(new Date(w.processed_at), 'dd MMM yyyy') : '—'}
                          </TableCell>
                          <TableCell>{statusBadge(w.status, 'withdrawal')}</TableCell>
                        </TableRow>,
                      ];
                      if (w.status === 'rejected' && w.rejection_reason) {
                        rows.push(
                          <TableRow key={w.id + '-reason'} className="bg-destructive/5">
                            <TableCell colSpan={4} className="text-xs text-destructive py-2">
                              <span className="font-medium">Reason:</span> {w.rejection_reason}
                            </TableCell>
                          </TableRow>
                        );
                      }
                      return rows;
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Bank details prompt */}
      <Dialog open={bankPromptOpen} onOpenChange={setBankPromptOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Payment Details</DialogTitle>
            <DialogDescription>
              {isPaypalUser
                ? 'Please add your PayPal email in profile before withdrawing.'
                : 'You need to add your bank/UPI details before making a withdrawal.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBankPromptOpen(false)}>Cancel</Button>
            <Button onClick={() => { setBankPromptOpen(false); navigate('/app/profile'); }}>
              Go to Profile
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Withdraw Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Withdraw Funds</DialogTitle>
            <DialogDescription>
              Available balance: ₹{formatMoney(availableBalance)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Input
              type="number"
              placeholder="Enter amount (min ₹100)"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              min={100}
              max={availableBalance}
            />
            {Number(withdrawAmount) > 0 && Number(withdrawAmount) < 100 && (
              <p className="text-xs text-destructive">Minimum withdrawal is ₹100</p>
            )}
            {Number(withdrawAmount) > availableBalance && (
              <p className="text-xs text-destructive">Amount exceeds available balance</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button
              onClick={handleWithdraw}
              disabled={submitting || Number(withdrawAmount) < 100 || Number(withdrawAmount) > availableBalance}
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Request Withdrawal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
