import { useMemo, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Download, IndianRupee, Inbox, Search, Copy, Check } from 'lucide-react';
import { format } from 'date-fns';
import { formatMoney } from '@/lib/formatMoney';
import { formatTaskId, matchesTaskId } from '@/lib/taskId';
import { toast } from 'sonner';

const PAGE_SIZE = 15;

interface PaymentRecord {
  taskId: string;            // raw uuid (the canonical submission id from `tasks.id`)
  taskIdShort: string;       // TASK-XXXXXX
  submissionRefShort: string;
  userName: string;
  taskName: string;
  amount: number;
  paymentDate: string;
  paymentTerms: string;
  status: 'Paid' | 'Pending';
}

async function fetchPaymentRecords(): Promise<PaymentRecord[]> {
  const { data: submissions, error: subErr } = await supabase
    .from('tasks')
    .select('id, user_id, project_id, status, created_at, updated_at')
    .order('updated_at', { ascending: false });
  if (subErr) throw subErr;
  if (!submissions?.length) return [];

  const projectIds = [...new Set(submissions.map((s) => s.project_id))];
  const userIds = [...new Set(submissions.map((s) => s.user_id))];

  const [{ data: projects }, { data: profiles }] = await Promise.all([
    supabase.from('projects').select('id, title, pay_per_task, payment_terms').in('id', projectIds),
    supabase.from('profiles').select('id, display_name').in('id', userIds),
  ]);

  const projectMap = new Map((projects ?? []).map((t) => [t.id, t]));
  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

  return submissions.map((s) => {
    const project = projectMap.get(s.project_id);
    const profile = profileMap.get(s.user_id);
    return {
      taskId: s.id,
      taskIdShort: formatTaskId(s.id),
      submissionRefShort: s.id.slice(0, 8).toUpperCase(),
      userName: profile?.display_name || 'Unknown',
      taskName: project?.title || 'Unknown Project',
      amount: Number(project?.pay_per_task) || 0,
      paymentDate: s.updated_at,
      paymentTerms: project?.payment_terms || 'on_completion',
      status: s.status === 'approved' ? 'Paid' as const : 'Pending' as const,
    };
  });
}

function exportCSV(records: PaymentRecord[]) {
  const header = 'Task ID,User Name,Project Name,Amount (₹),Payment Date,Payment Terms,Transaction Ref,Status';
  const rows = records.map((r) =>
    `"${r.taskIdShort}","${r.userName}","${r.taskName}",${r.amount},"${format(new Date(r.paymentDate), 'dd MMM yyyy')}","${r.paymentTerms}","TXN-${r.submissionRefShort}","${r.status}"`,
  );
  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `payment_records_${format(new Date(), 'yyyy-MM-dd')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Payments() {
  const { data: records = [], isLoading } = useQuery({
    queryKey: ['admin-payments'],
    queryFn: fetchPaymentRecords,
  });

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(0);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(0); }, [debouncedSearch]);

  const filtered = useMemo(() => {
    if (!debouncedSearch) return records;
    const q = debouncedSearch.toLowerCase();
    return records.filter((r) =>
      matchesTaskId(r.taskId, debouncedSearch) ||
      r.userName.toLowerCase().includes(q) ||
      r.taskName.toLowerCase().includes(q),
    );
  }, [records, debouncedSearch]);

  const totalPaid = filtered.filter((r) => r.status === 'Paid').reduce((s, r) => s + r.amount, 0);
  const totalPending = filtered.filter((r) => r.status === 'Pending').reduce((s, r) => s + r.amount, 0);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleCopy = async (record: PaymentRecord) => {
    try {
      await navigator.clipboard.writeText(record.taskIdShort);
      setCopiedId(record.taskId);
      toast.success(`Copied ${record.taskIdShort}`);
      setTimeout(() => setCopiedId((c) => (c === record.taskId ? null : c)), 1500);
    } catch {
      toast.error('Failed to copy');
    }
  };

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Payment Records</h1>
          <p className="text-sm text-muted-foreground">Full payment history for all contributors</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => exportCSV(filtered)} disabled={filtered.length === 0}>
          <Download className="h-4 w-4 mr-2" /> Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card className="shadow-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
              <IndianRupee className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Paid</p>
              <p className="font-display text-xl font-bold">₹{formatMoney(totalPaid)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-yellow-500/10">
              <IndianRupee className="h-5 w-5 text-yellow-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pending</p>
              <p className="font-display text-xl font-bold">₹{formatMoney(totalPending)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by Task ID, user, or project…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="rounded-lg border border-border bg-card shadow-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Task ID</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Project</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Terms</TableHead>
              <TableHead>Txn Ref</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={8}><Skeleton className="h-8 w-full" /></TableCell>
                </TableRow>
              ))
            ) : paginated.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12">
                  <div className="flex flex-col items-center gap-2">
                    <Inbox className="h-8 w-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      {debouncedSearch ? 'No payment records match your search' : 'No payment records yet'}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              paginated.map((r) => (
                <TableRow key={r.taskId}>
                  <TableCell>
                    <button
                      onClick={() => handleCopy(r)}
                      title="Click to copy Task ID"
                      className="inline-flex items-center gap-1 text-xs font-mono text-foreground hover:text-primary group"
                    >
                      {r.taskIdShort}
                      {copiedId === r.taskId
                        ? <Check className="h-3 w-3 text-success" />
                        : <Copy className="h-3 w-3 opacity-50 group-hover:opacity-100" />}
                    </button>
                  </TableCell>
                  <TableCell className="font-medium text-sm">{r.userName}</TableCell>
                  <TableCell className="text-sm max-w-[150px] truncate">{r.taskName}</TableCell>
                  <TableCell className="text-sm">₹{formatMoney(r.amount)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(r.paymentDate), 'dd MMM yyyy')}
                  </TableCell>
                  <TableCell className="text-sm capitalize">{r.paymentTerms.replace('_', ' ')}</TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground">TXN-{r.submissionRefShort}</TableCell>
                  <TableCell>
                    <Badge variant={r.status === 'Paid' ? 'default' : 'secondary'}>{r.status}</Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page + 1} of {totalPages} · {filtered.length} records
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
    </div>
  );
}
