import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Inbox, Loader2, CheckCircle2, XCircle, BanknoteIcon, ExternalLink, Copy, Check, Search, Download } from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { formatWithdrawalId, matchesWithdrawalId } from '@/lib/taskId';

interface WithdrawRequest {
  id: string;
  user_id: string;
  amount: number;
  status: string;
  created_at: string;
  processed_at: string | null;
  display_name: string;
  payment_method: 'india' | 'paypal';
  // Snapshot at request time (preferred); falls back to current profile if absent
  upi_id: string | null;
  account_holder_name: string | null;
  bank_account_number: string | null;
  ifsc_code: string | null;
  paypal_email: string | null;
}

function maskAccount(acct: string | null): string {
  if (!acct) return '—';
  const trimmed = acct.replace(/\s+/g, '');
  if (trimmed.length <= 4) return trimmed;
  return `XXXX${trimmed.slice(-4)}`;
}

async function fetchRequests(): Promise<WithdrawRequest[]> {
  const { data, error } = await supabase
    .from('withdraw_requests')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;

  const rows = data ?? [];
  if (rows.length === 0) return [];

  const userIds = [...new Set(rows.map((r: any) => r.user_id))];
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name, upi_id, account_holder_name, bank_account_number, ifsc_code, paypal_email, payout_country')
    .in('id', userIds);

  const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));

  return rows.map((r: any) => {
    const p: any = profileMap.get(r.user_id);
    const isPending = r.status === 'pending';
    const pick = (snapshot: any, live: any) =>
      isPending ? (live ?? snapshot ?? null) : (snapshot ?? null);

    // Backward compatibility: rows without payment_method default to 'india'
    const method: 'india' | 'paypal' =
      (r.payment_method === 'paypal' ? 'paypal' : 'india');

    return {
      id: r.id,
      user_id: r.user_id,
      amount: Number(r.amount),
      status: r.status,
      created_at: r.created_at,
      processed_at: r.processed_at,
      display_name: p?.display_name ?? 'Unknown',
      payment_method: method,
      upi_id: pick(r.upi_id_snapshot, p?.upi_id),
      account_holder_name: pick(r.account_holder_name_snapshot, p?.account_holder_name),
      bank_account_number: pick(r.bank_account_snapshot, p?.bank_account_number),
      ifsc_code: pick(r.ifsc_snapshot, p?.ifsc_code),
      paypal_email: pick(r.paypal_email_snapshot, p?.paypal_email),
    };
  });
}

// Valid status transitions
const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ['approved', 'rejected'],
  approved: ['paid'],
};

const PAGE_SIZE = 15;

export default function WithdrawRequests() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ req: WithdrawRequest; status: string } | null>(null);
  const [rejectDialog, setRejectDialog] = useState<{ req: WithdrawRequest } | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['admin-withdraw-requests'],
    queryFn: fetchRequests,
  });

  const filtered = requests.filter((r) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    if (matchesWithdrawalId(r.id, search)) return true;
    if (r.display_name?.toLowerCase().includes(q)) return true;
    if (String(r.amount).includes(q)) return true;
    return false;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  useEffect(() => { if (page > 0 && page >= totalPages) setPage(totalPages - 1); }, [page, totalPages]);
  useEffect(() => { setPage(0); }, [search]);

  const copyId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(formatWithdrawalId(id));
      setCopiedId(id);
      toast.success('Withdrawal ID copied');
      setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1500);
    } catch {
      toast.error('Copy failed');
    }
  };

  const updateStatus = useMutation({
    mutationFn: async ({ id, status, userId, amount, currentStatus, rejectionReason }: {
      id: string; status: string; userId: string; amount: number; currentStatus: string; rejectionReason?: string;
    }) => {
      // Idempotency: block if already in target status
      if (currentStatus === status) {
        throw new Error(`Request is already ${status}`);
      }

      // Validate transition
      const allowed = VALID_TRANSITIONS[currentStatus];
      if (!allowed || !allowed.includes(status)) {
        throw new Error(`Cannot transition from ${currentStatus} to ${status}`);
      }

      // Re-fetch to guard against race conditions
      const { data: fresh, error: fetchErr } = await supabase
        .from('withdraw_requests')
        .select('status')
        .eq('id', id)
        .single();
      if (fetchErr) throw fetchErr;
      if (fresh.status !== currentStatus) {
        throw new Error(`Status already changed to "${fresh.status}". Please refresh.`);
      }

      const { data: snapshotSource, error: snapshotErr } = await supabase
        .from('withdraw_requests')
        .select('upi_id_snapshot, account_holder_name_snapshot, bank_account_snapshot, ifsc_snapshot, paypal_email_snapshot')
        .eq('id', id)
        .single();
      if (snapshotErr) throw snapshotErr;

      const updates: any = { status };
      if ((status === 'approved' || status === 'paid' || status === 'rejected') && snapshotSource) {
        updates.upi_id_snapshot = snapshotSource.upi_id_snapshot ?? null;
        updates.account_holder_name_snapshot = snapshotSource.account_holder_name_snapshot ?? null;
        updates.bank_account_snapshot = snapshotSource.bank_account_snapshot ?? null;
        updates.ifsc_snapshot = snapshotSource.ifsc_snapshot ?? null;
        updates.paypal_email_snapshot = (snapshotSource as any).paypal_email_snapshot ?? null;
      }
      if (status === 'paid' || status === 'rejected') {
        updates.processed_at = new Date().toISOString();
      }
      if (status === 'rejected' && rejectionReason) {
        updates.rejection_reason = rejectionReason;
      }

      const { error } = await supabase
        .from('withdraw_requests')
        .update(updates)
        .eq('id', id);
      if (error) throw error;

      // When marking as paid: update earnings and profile atomically
      if (status === 'paid') {
        const { error: earningsErr } = await supabase
          .from('earnings')
          .update({ status: 'paid' } as any)
          .eq('user_id', userId)
          .eq('status', 'approved');
        if (earningsErr) throw earningsErr;

        const { data: profileData } = await supabase
          .from('profiles')
          .select('wallet_balance, total_paid')
          .eq('id', userId)
          .single();

        if (profileData) {
          const newBalance = Math.max(0, Number(profileData.wallet_balance) - amount);
          const newTotalPaid = Number(profileData.total_paid) + amount;
          const { error: profileErr } = await supabase
            .from('profiles')
            .update({ wallet_balance: newBalance, total_paid: newTotalPaid } as any)
            .eq('id', userId);
          if (profileErr) throw profileErr;
        }
      }
    },
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ['admin-withdraw-requests'] });
      queryClient.invalidateQueries({ queryKey: ['admin-payout-history'] });
      toast.success(`Request marked as ${status}`);
      setProcessingId(null);
    },
    onError: (err: any) => {
      toast.error(err.message || 'Action failed');
      setProcessingId(null);
    },
  });

  const handleAction = (req: WithdrawRequest, status: string) => {
    // Block paid if missing payout destination for the request's method
    if (status === 'paid') {
      if (req.payment_method === 'paypal' && !req.paypal_email) {
        toast.error('This user has not set their PayPal email. Ask them to add it in Profile → Payment before payout.');
        return;
      }
      if (req.payment_method === 'india' && !req.upi_id) {
        toast.error('This user has not set their UPI ID. Ask them to add payment details in Profile → Payment before withdrawal.');
        return;
      }
    }
    if (status === 'paid') {
      setConfirmDialog({ req, status });
      return;
    }
    if (status === 'rejected') {
      setRejectReason('');
      setRejectDialog({ req });
      return;
    }
    executeAction(req, status);
  };

  const executeAction = (req: WithdrawRequest, status: string, rejectionReason?: string) => {
    setProcessingId(req.id + status);
    updateStatus.mutate({
      id: req.id,
      status,
      userId: req.user_id,
      amount: req.amount,
      currentStatus: req.status,
      rejectionReason,
    });
  };

  const statusBadge = (status: string) => {
    const map: Record<string, { label: string; className: string }> = {
      pending: { label: 'Pending', className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
      approved: { label: 'Approved', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
      rejected: { label: 'Rejected', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
      paid: { label: 'Paid', className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
    };
    const s = map[status] ?? { label: status, className: 'bg-muted text-muted-foreground' };
    return <Badge variant="outline" className={`border-0 text-xs ${s.className}`}>{s.label}</Badge>;
  };

  const exportApprovedCsv = async () => {
    const approved = requests.filter((r) => r.status === 'approved');
    if (approved.length === 0) {
      toast.error('No approved withdrawals to export');
      return;
    }

    // Best-effort email lookup (auth.users not exposed) via support_tickets
    const userIds = [...new Set(approved.map((r) => r.user_id))];
    const { data: tickets } = await supabase
      .from('support_tickets')
      .select('user_id, user_email')
      .in('user_id', userIds);
    const emailMap = new Map<string, string>();
    (tickets ?? []).forEach((t: any) => { if (t.user_email && !emailMap.has(t.user_id)) emailMap.set(t.user_id, t.user_email); });

    const escape = (v: any) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const totalAmount = approved.reduce((sum, r) => sum + r.amount, 0);
    const today = format(new Date(), 'yyyy-MM-dd');

    const lines: string[] = [];
    // Summary header
    lines.push(`# Approved Withdrawals Export,Generated: ${today}`);
    lines.push(`# Total Requests: ${approved.length},Total Approved Amount: ₹${totalAmount.toLocaleString('en-IN')}`);
    lines.push('');
    // Column headers
    lines.push([
      'Withdrawal ID',
      'User Name',
      'Email',
      'Amount (₹)',
      'Payment Method',
      'PayPal Email',
      'UPI ID',
      'Account Holder Name',
      'Bank Account',
      'IFSC Code',
      'Requested Date',
      'Status',
    ].join(','));
    // Rows
    approved.forEach((r) => {
      lines.push([
        escape(formatWithdrawalId(r.id)),
        escape(r.display_name || ''),
        escape(emailMap.get(r.user_id) || ''),
        escape(r.amount),
        escape(r.payment_method === 'paypal' ? 'PayPal' : 'India'),
        escape(r.payment_method === 'paypal' ? (r.paypal_email || '') : ''),
        escape(r.payment_method === 'india' ? (r.upi_id || '') : ''),
        escape(r.payment_method === 'india' ? (r.account_holder_name || '') : ''),
        escape(r.payment_method === 'india' ? (r.bank_account_number || '') : ''),
        escape(r.payment_method === 'india' ? (r.ifsc_code || '') : ''),
        escape(format(new Date(r.created_at), 'yyyy-MM-dd')),
        escape('Approved'),
      ].join(','));
    });

    const csv = lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `approved_withdrawals_${today}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${approved.length} approved withdrawal${approved.length === 1 ? '' : 's'}`);
  };

  const approvedCount = requests.filter((r) => r.status === 'approved').length;

  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h1 className="font-display text-2xl font-bold">Withdraw Requests</h1>
        <p className="text-sm text-muted-foreground">Review and process contributor withdrawal requests — this is the ONLY place to mark payouts</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by Withdrawal ID, name, or amount…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={exportApprovedCsv}
          disabled={approvedCount === 0}
          className="gap-2"
          title={approvedCount === 0 ? 'No approved withdrawals' : `Export ${approvedCount} approved withdrawal${approvedCount === 1 ? '' : 's'}`}
        >
          <Download className="h-4 w-4" />
          Export Approved Withdrawals CSV{approvedCount > 0 ? ` (${approvedCount})` : ''}
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading…</div>
      ) : filtered.length === 0 ? (
        <Card className="shadow-card">
          <CardContent className="flex flex-col items-center gap-2 py-12">
            <Inbox className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{search ? 'No matching withdrawal requests' : 'No withdrawal requests'}</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="shadow-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Withdrawal ID</TableHead>
                <TableHead>User</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Payment Details</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Requested</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.map((req) => (
                <TableRow key={req.id}>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => navigate(`/admin/payouts?wd=${encodeURIComponent(req.id)}`)}
                        className="font-mono text-xs font-semibold text-primary hover:underline"
                        title="Trace in Payout History"
                      >
                        {formatWithdrawalId(req.id)}
                      </button>
                      <button
                        onClick={() => copyId(req.id)}
                        className="text-muted-foreground hover:text-foreground"
                        title="Copy ID"
                      >
                        {copiedId === req.id ? <Check className="h-3 w-3 text-primary" /> : <Copy className="h-3 w-3" />}
                      </button>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">
                    <button
                      onClick={() => navigate(`/admin/contributors/${req.user_id}`)}
                      className="inline-flex items-center gap-1 text-foreground hover:text-primary hover:underline"
                      title="View contributor profile"
                    >
                      {req.display_name}
                      <ExternalLink className="h-3 w-3 opacity-60" />
                    </button>
                  </TableCell>
                  <TableCell className="text-right font-display font-bold">
                    ₹{req.amount.toLocaleString('en-IN')}
                  </TableCell>
                  <TableCell>
                    {req.payment_method === 'paypal' ? (
                      <Badge variant="outline" className="border-0 text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">PayPal</Badge>
                    ) : (
                      <Badge variant="outline" className="border-0 text-xs bg-success/15 text-success">India</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {req.payment_method === 'paypal' ? (
                      req.paypal_email ? (
                        <span className="text-sm break-all">{req.paypal_email}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">PayPal email not set</span>
                      )
                    ) : (
                      <div className="flex flex-col gap-0.5 text-xs">
                        <span>
                          <span className="text-muted-foreground">UPI: </span>
                          {req.upi_id || <span className="text-muted-foreground">—</span>}
                        </span>
                        <span>
                          <span className="text-muted-foreground">Holder: </span>
                          {req.account_holder_name || <span className="text-muted-foreground">—</span>}
                        </span>
                        <span className="font-mono">
                          <span className="text-muted-foreground font-sans">A/C: </span>
                          {maskAccount(req.bank_account_number)}
                        </span>
                        <span className="font-mono">
                          <span className="text-muted-foreground font-sans">IFSC: </span>
                          {req.ifsc_code || <span className="text-muted-foreground font-sans">—</span>}
                        </span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>{statusBadge(req.status)}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {format(new Date(req.created_at), 'dd MMM yyyy')}
                  </TableCell>
                  <TableCell className="text-right">
                    {req.status === 'pending' && (
                      <div className="flex gap-1 justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleAction(req, 'approved')}
                          disabled={processingId === req.id + 'approved'}
                          className="gap-1 text-xs"
                        >
                          {processingId === req.id + 'approved' ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleAction(req, 'rejected')}
                          disabled={processingId === req.id + 'rejected'}
                          className="gap-1 text-xs text-destructive"
                        >
                          {processingId === req.id + 'rejected' ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
                          Reject
                        </Button>
                      </div>
                    )}
                    {req.status === 'approved' && (
                      <Button
                        size="sm"
                        onClick={() => handleAction(req, 'paid')}
                        disabled={processingId === req.id + 'paid'}
                        className="gap-1 text-xs"
                      >
                        {processingId === req.id + 'paid' ? <Loader2 className="h-3 w-3 animate-spin" /> : <BanknoteIcon className="h-3 w-3" />}
                        Mark Paid
                      </Button>
                    )}
                    {(req.status === 'paid' || req.status === 'rejected') && (
                      <span className="text-xs text-muted-foreground">
                        {req.processed_at ? format(new Date(req.processed_at), 'dd MMM') : '—'}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Pagination */}
      {!isLoading && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page + 1} of {totalPages} · {requests.length} requests
          </p>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            {Array.from({ length: Math.min(totalPages, 5) }).map((_, i) => (
              <Button key={i} variant={page === i ? 'default' : 'outline'} size="sm" onClick={() => setPage(i)}>
                {i + 1}
              </Button>
            ))}
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Confirmation dialog for Mark Paid */}
      <AlertDialog open={!!confirmDialog} onOpenChange={(open) => !open && setConfirmDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Payment</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to send{' '}
              <span className="font-bold text-foreground">
                ₹{confirmDialog?.req.amount.toLocaleString('en-IN')}
              </span>{' '}
              to <span className="font-bold text-foreground">{confirmDialog?.req.display_name}</span>?
              {confirmDialog?.req.payment_method === 'paypal' && confirmDialog?.req.paypal_email && (
                <span className="block mt-1">PayPal: {confirmDialog.req.paypal_email}</span>
              )}
              {confirmDialog?.req.payment_method === 'india' && confirmDialog?.req.upi_id && (
                <span className="block mt-1">UPI: {confirmDialog.req.upi_id}</span>
              )}
              <span className="block mt-2 text-xs">This action cannot be undone.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDialog) {
                  executeAction(confirmDialog.req, confirmDialog.status);
                  setConfirmDialog(null);
                }
              }}
            >
              Yes, Mark as Paid
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject dialog with mandatory reason */}
      <Dialog open={!!rejectDialog} onOpenChange={(open) => !open && setRejectDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Withdrawal Request</DialogTitle>
            <DialogDescription>
              Provide a reason for rejecting this withdrawal request. The user will be notified.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <p><span className="text-muted-foreground">User:</span> <span className="font-medium">{rejectDialog?.req.display_name}</span></p>
              <p><span className="text-muted-foreground">Amount:</span> <span className="font-bold">₹{rejectDialog?.req.amount.toLocaleString('en-IN')}</span></p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reject-reason">Rejection Reason <span className="text-destructive">*</span></Label>
              <Textarea
                id="reject-reason"
                placeholder="e.g. Bank details mismatch, KYC pending, etc."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                maxLength={500}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialog(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={rejectReason.trim().length < 5}
              onClick={() => {
                if (rejectDialog && rejectReason.trim().length >= 5) {
                  executeAction(rejectDialog.req, 'rejected', rejectReason.trim());
                  setRejectDialog(null);
                }
              }}
            >
              Confirm Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
