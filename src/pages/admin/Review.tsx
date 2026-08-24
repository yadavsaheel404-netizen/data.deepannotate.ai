import { useMemo, useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAllSubmissions } from '@/services/taskService';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Inbox, Eye, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { formatMoney } from '@/lib/formatMoney';

type FilterStatus = 'all' | 'in_review' | 'approved' | 'rejected';
const PAGE_SIZE = 15;

export default function AdminReview() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [page, setPage] = useState(0);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(0); }, [debouncedSearch, filter]);

  const { data: submissions = [], isLoading } = useQuery({
    queryKey: ['admin-submissions'],
    queryFn: fetchAllSubmissions,
  });

  // Top-level dashboard counts (across ALL submissions)
  const stats = useMemo(() => ({
    total: submissions.length,
    pending: submissions.filter((s) => s.status === 'in_review').length,
    approved: submissions.filter((s) => s.status === 'approved').length,
    rejected: submissions.filter((s) => s.status === 'rejected').length,
  }), [submissions]);

  const taskRows = useMemo(() => {
    const map: Record<string, {
      taskId: string; taskTitle: string; total: number; pending: number;
      approved: number; rejected: number; startDate: string | null;
      endDate: string | null; amountToRelease: number;
    }> = {};

    for (const sub of submissions) {
      const key = (sub as any).project_id;
      if (!map[key]) {
        map[key] = {
          taskId: key,
          taskTitle: (sub as any).task_title ?? 'Unknown Project',
          total: 0, pending: 0, approved: 0, rejected: 0,
          startDate: (sub as any).task_start_date ?? null,
          endDate: (sub as any).task_end_date ?? null,
          amountToRelease: 0,
        };
      }
      map[key].total++;
      if (sub.status === 'in_review') map[key].pending++;
      else if (sub.status === 'approved') {
        map[key].approved++;
        map[key].amountToRelease += (sub as any).task_pay ?? 0;
      } else if (sub.status === 'rejected') map[key].rejected++;
    }
    return Object.values(map);
  }, [submissions]);

  // Apply search filter
  const searched = useMemo(() => {
    if (!debouncedSearch) return taskRows;
    const q = debouncedSearch.toLowerCase();
    return taskRows.filter((t) => t.taskTitle.toLowerCase().includes(q));
  }, [taskRows, debouncedSearch]);

  // Apply status filter
  const filtered = useMemo(() => {
    if (filter === 'all') return searched;
    return searched.filter((t) => {
      if (filter === 'in_review') return t.pending > 0;
      if (filter === 'approved') return t.approved > 0;
      if (filter === 'rejected') return t.rejected > 0;
      return true;
    });
  }, [searched, filter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h1 className="font-display text-2xl font-bold">Task Review</h1>
        <p className="text-sm text-muted-foreground">Select a project to review its tasks</p>
      </div>

      {/* Stats dashboard */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="shadow-card">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Tasks</p>
            <p className="font-display text-2xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">In Review</p>
            <p className="font-display text-2xl font-bold text-amber-600 dark:text-amber-400">{stats.pending}</p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Approved</p>
            <p className="font-display text-2xl font-bold text-green-600 dark:text-green-400">{stats.approved}</p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Rejected</p>
            <p className="font-display text-2xl font-bold text-red-600 dark:text-red-400">{stats.rejected}</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by project name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Filters */}
      <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterStatus)}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="in_review">Has In Review</TabsTrigger>
          <TabsTrigger value="approved">Has Approved</TabsTrigger>
          <TabsTrigger value="rejected">Has Rejected</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">Loading projects…</div>
      ) : paginated.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12">
          <Inbox className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {debouncedSearch ? 'No projects match your search' : 'No tasks yet'}
          </p>
        </div>
      ) : (
        <>
          <Card className="shadow-card">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Project Name</TableHead>
                    <TableHead className="text-center">Total</TableHead>
                    <TableHead className="text-center">In Review</TableHead>
                    <TableHead className="text-center">Approved</TableHead>
                    <TableHead className="text-center">Rejected</TableHead>
                    <TableHead>Start Date</TableHead>
                    <TableHead>End Date</TableHead>
                    <TableHead className="text-right">Amount (₹)</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.map((t) => (
                    <TableRow key={t.taskId}>
                      <TableCell className="font-medium">{t.taskTitle}</TableCell>
                      <TableCell className="text-center">{t.total}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-0">{t.pending}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-0">{t.approved}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-0">{t.rejected}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {t.startDate ? format(new Date(t.startDate), 'dd MMM yyyy') : '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {t.endDate ? format(new Date(t.endDate), 'dd MMM yyyy') : '—'}
                      </TableCell>
                      <TableCell className="text-right font-medium">₹{formatMoney(t.amountToRelease)}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => navigate(`/admin/review/${t.taskId}`)}>
                          <Eye className="h-4 w-4 mr-1" /> Review
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button variant="outline" size="sm" disabled={page <= 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              {Array.from({ length: totalPages }, (_, i) => (
                <Button key={i} variant={page === i ? 'default' : 'outline'} size="sm" onClick={() => setPage(i)}>
                  {i + 1}
                </Button>
              ))}
              <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
