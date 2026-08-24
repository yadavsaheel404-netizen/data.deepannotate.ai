import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Inbox, CalendarIcon, ChevronLeft, ChevronRight, Copy, Check, Search, X } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { formatWithdrawalId, matchesWithdrawalId } from '@/lib/taskId';
import { toast } from 'sonner';

const PAGE_SIZE = 15;

interface PayoutRecord {
  id: string;
  display_name: string;
  amount: number;
  status: string;
  created_at: string;
  processed_at: string | null;
  task_title: string;
}

async function fetchPayoutHistory(): Promise<PayoutRecord[]> {
  // Get withdraw requests
  const { data, error } = await supabase
    .from('withdraw_requests')
    .select('*')
    .in('status', ['paid', 'rejected'])
    .order('processed_at', { ascending: false });
  if (error) throw error;
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const userIds = [...new Set(rows.map((r: any) => r.user_id))];
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name')
    .in('id', userIds);
  const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));

  return rows.map((r: any) => ({
    id: r.id,
    display_name: profileMap.get(r.user_id)?.display_name ?? 'Unknown',
    amount: Number(r.amount),
    status: r.status,
    created_at: r.created_at,
    processed_at: r.processed_at,
    task_title: 'General',
  }));
}

export default function AdminPayouts() {
  const { data: records = [], isLoading } = useQuery({
    queryKey: ['admin-payout-history'],
    queryFn: fetchPayoutHistory,
  });

  const [searchParams, setSearchParams] = useSearchParams();
  const wdParam = searchParams.get('wd') ?? '';

  const [page, setPage] = useState(0);
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => { setPage(0); }, [dateFrom, dateTo, statusFilter, search, wdParam]);

  const filtered = useMemo(() => {
    let result = records;
    if (wdParam) {
      result = result.filter((r) => r.id === wdParam);
    }
    if (statusFilter !== 'all') {
      result = result.filter((r) => r.status === statusFilter);
    }
    if (dateFrom) {
      result = result.filter((r) => new Date(r.created_at) >= dateFrom);
    }
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      result = result.filter((r) => new Date(r.created_at) <= end);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((r) =>
        matchesWithdrawalId(r.id, search) ||
        r.display_name?.toLowerCase().includes(q) ||
        String(r.amount).includes(q)
      );
    }
    return result;
  }, [records, statusFilter, dateFrom, dateTo, search, wdParam]);

  const totalPaid = filtered.filter((r) => r.status === 'paid').reduce((s, r) => s + r.amount, 0);
  const totalRejected = filtered.filter((r) => r.status === 'rejected').reduce((s, r) => s + r.amount, 0);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

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

  const clearWdTrace = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('wd');
    setSearchParams(next, { replace: true });
  };

  const statusBadge = (status: string) => {
    const map: Record<string, { label: string; className: string }> = {
      paid: { label: 'Paid', className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
      rejected: { label: 'Rejected', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
    };
    const s = map[status] ?? { label: status, className: 'bg-muted text-muted-foreground' };
    return <Badge variant="outline" className={`border-0 text-xs ${s.className}`}>{s.label}</Badge>;
  };

  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h1 className="font-display text-2xl font-bold">Payout History</h1>
        <p className="text-sm text-muted-foreground">Completed and rejected payouts</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total Records</p><p className="text-xl font-bold font-display">{filtered.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total Paid</p><p className="text-xl font-bold font-display text-primary">₹{totalPaid.toLocaleString('en-IN')}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total Rejected</p><p className="text-xl font-bold font-display text-destructive">₹{totalRejected.toLocaleString('en-IN')}</p></CardContent></Card>
      </div>

      {/* WD trace banner */}
      {wdParam && (
        <div className="flex items-center justify-between gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <span>
            Tracing withdrawal <span className="font-mono font-semibold text-primary">{formatWithdrawalId(wdParam)}</span>
          </span>
          <Button variant="ghost" size="sm" onClick={clearWdTrace} className="gap-1 h-7">
            <X className="h-3 w-3" /> Clear
          </Button>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap items-center">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by Withdrawal ID, name, or amount…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn("gap-1", !dateFrom && "text-muted-foreground")}>
              <CalendarIcon className="h-3 w-3" />
              {dateFrom ? format(dateFrom, 'MMM d, yyyy') : 'From date'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} className="p-3 pointer-events-auto" />
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn("gap-1", !dateTo && "text-muted-foreground")}>
              <CalendarIcon className="h-3 w-3" />
              {dateTo ? format(dateTo, 'MMM d, yyyy') : 'To date'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={dateTo} onSelect={setDateTo} className="p-3 pointer-events-auto" />
          </PopoverContent>
        </Popover>

        {(dateFrom || dateTo || statusFilter !== 'all' || search) && (
          <Button variant="ghost" size="sm" onClick={() => { setDateFrom(undefined); setDateTo(undefined); setStatusFilter('all'); setSearch(''); }}>
            Clear filters
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading…</div>
      ) : paginated.length === 0 ? (
        <Card className="shadow-card">
          <CardContent className="flex flex-col items-center gap-2 py-12">
            <Inbox className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No payout history found</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="shadow-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Withdrawal ID</TableHead>
                <TableHead>Contributor</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Requested</TableHead>
                <TableHead>Processed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <span className="font-mono text-xs font-semibold text-primary">{formatWithdrawalId(r.id)}</span>
                      <button onClick={() => copyId(r.id)} className="text-muted-foreground hover:text-foreground" title="Copy ID">
                        {copiedId === r.id ? <Check className="h-3 w-3 text-primary" /> : <Copy className="h-3 w-3" />}
                      </button>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">{r.display_name}</TableCell>
                  <TableCell className="text-right font-display font-bold">₹{r.amount.toLocaleString('en-IN')}</TableCell>
                  <TableCell>{statusBadge(r.status)}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{format(new Date(r.created_at), 'dd MMM yyyy')}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{r.processed_at ? format(new Date(r.processed_at), 'dd MMM yyyy') : '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Page {page + 1} of {totalPages}</p>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {Array.from({ length: Math.min(totalPages, 5) }).map((_, i) => (
              <Button key={i} variant={page === i ? 'default' : 'outline'} size="sm" onClick={() => setPage(i)}>{i + 1}</Button>
            ))}
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
