import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchMySubmissions, getSubmissionSignedUrl } from '@/services/taskService';
import type { Submission } from '@/types/task';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Inbox, CheckCircle2, Clock, XCircle, RefreshCw, CalendarIcon, ChevronLeft, ChevronRight, Copy } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { formatTaskId } from '@/lib/taskId';
import { toast } from 'sonner';

const PAGE_SIZE = 15;

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; variant: 'default' | 'secondary' | 'destructive' }> = {
  in_review: { label: 'In Review', icon: Clock, variant: 'secondary' },
  approved: { label: 'Approved', icon: CheckCircle2, variant: 'default' },
  rejected: { label: 'Rejected', icon: XCircle, variant: 'destructive' },
};

type SubmissionRow = Submission & { task_title?: string; task_media_type?: string };
type DateRange = 'all' | 'today' | '7days' | '30days' | 'custom';

function getDateCutoff(range: DateRange): Date | null {
  if (range === 'all' || range === 'custom') return null;
  const now = new Date();
  if (range === 'today') { const s = new Date(now); s.setHours(0, 0, 0, 0); return s; }
  if (range === '7days') { const d = new Date(now); d.setDate(d.getDate() - 7); return d; }
  const d = new Date(now); d.setDate(d.getDate() - 30); return d;
}

export default function MySubmissions() {
  const [searchParams] = useSearchParams();
  const initialFilter = searchParams.get('filter') || 'all';
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState(initialFilter);
  const [dateRange, setDateRange] = useState<DateRange>('all');
  const [projectFilter, setProjectFilter] = useState('all');
  const [selected, setSelected] = useState<SubmissionRow | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [customDateFrom, setCustomDateFrom] = useState<Date | undefined>();
  const [customDateTo, setCustomDateTo] = useState<Date | undefined>();
  const [page, setPage] = useState(0);

  const loadData = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true); else setLoading(true);
    try { setSubmissions(await fetchMySubmissions() as SubmissionRow[]); } catch { /* silent */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { setPage(0); }, [filter, dateRange, projectFilter, customDateFrom, customDateTo]);

  const projectNames = Array.from(new Set(submissions.map((s) => s.task_title || 'Project'))).sort();

  // Apply project + date filters first (NOT status) to compute dynamic counts
  const scoped = submissions.filter((s) => {
    if (projectFilter !== 'all' && (s.task_title || 'Project') !== projectFilter) return false;
    if (dateRange === 'custom') {
      const d = new Date(s.created_at);
      if (customDateFrom && d < customDateFrom) return false;
      if (customDateTo) { const end = new Date(customDateTo); end.setHours(23, 59, 59, 999); if (d > end) return false; }
      return true;
    }
    const cutoff = getDateCutoff(dateRange);
    if (cutoff && new Date(s.created_at) < cutoff) return false;
    return true;
  });

  const counts = {
    all: scoped.length,
    pending: scoped.filter((s) => s.status === 'in_review').length,
    approved: scoped.filter((s) => s.status === 'approved').length,
    rejected: scoped.filter((s) => s.status === 'rejected').length,
  };

  const filtered = scoped.filter((s) => filter === 'all' || s.status === filter);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const openPreview = async (sub: SubmissionRow) => {
    setSelected(sub);
    setPreviewUrl(null);
    if (sub.file_url) { setPreviewUrl(await getSubmissionSignedUrl(sub.file_url)); }
  };

  const mediaType = selected?.task_media_type || inferMediaType(selected?.file_url);

  return (
    <div className="space-y-4 animate-slide-up bg-[#F7F9FA]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-bold text-[#0A1628]">My Work</h1>
          <p className="text-sm text-[#6B7280]">Track your progress</p>
        </div>
        <Button variant="outline" size="icon" onClick={() => loadData(true)} disabled={refreshing} className="shrink-0 bg-white border-[#E5E7EB] text-[#0A1628] hover:bg-slate-50">
          <RefreshCw className={`h-4 w-4 text-[#06B6D4] ${refreshing ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Compact filter area */}
      <div className="space-y-3">
        {/* Pill filter buttons — uniform, horizontally scrollable on overflow */}
        <div className="-mx-1 overflow-x-auto px-1">
          <div className="flex gap-2 min-w-max">
            {([
              ['all', 'All', counts.all],
              ['in_review', 'In Review', counts.pending],
              ['approved', 'Approved', counts.approved],
              ['rejected', 'Rejected', counts.rejected],
            ] as [string, string, number][]).map(([key, label, count]) => {
              const active = filter === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  className={cn(
                    'inline-flex h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-[13px] font-semibold leading-none transition-colors cursor-pointer',
                    active
                      ? 'bg-[#06B6D4] text-white border-[#06B6D4]'
                      : 'bg-white text-[#6B7280] border-[#E5E7EB] hover:bg-slate-50'
                  )}
                >
                  <span>{label}</span>
                  <span className={cn('text-[12px] font-normal', active ? 'opacity-90' : 'opacity-60')}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Filter dropdowns */}
        <div className="space-y-1.5">
          <span className="text-xs font-semibold text-[#6B7280]">Filter by:</span>
          <div className="flex gap-2">
            <Select value={dateRange} onValueChange={(v) => { setDateRange(v as DateRange); if (v !== 'custom') { setCustomDateFrom(undefined); setCustomDateTo(undefined); } }}>
              <SelectTrigger className="flex-1 h-9 text-xs bg-white border-[#E5E7EB] text-[#0A1628]"><SelectValue placeholder="Date range" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="7days">Last 7 Days</SelectItem>
                <SelectItem value="30days">Last 30 Days</SelectItem>
                <SelectItem value="custom">Custom Range</SelectItem>
              </SelectContent>
            </Select>

            <Select value={projectFilter} onValueChange={setProjectFilter}>
              <SelectTrigger className="flex-1 h-9 text-xs bg-white border-[#E5E7EB] text-[#0A1628]"><SelectValue placeholder="All Projects" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Projects</SelectItem>
                {projectNames.map((name) => (<SelectItem key={name} value={name}>{name}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>

          {dateRange === 'custom' && (
            <div className="flex gap-1 items-center pt-1">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("h-9 text-xs gap-1 bg-white border-[#E5E7EB]", !customDateFrom && "text-[#9CA3AF]")}>
                    <CalendarIcon className="h-3 w-3 text-[#06B6D4]" />{customDateFrom ? format(customDateFrom, 'MMM d') : 'From'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={customDateFrom} onSelect={setCustomDateFrom} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
              <span className="text-xs text-[#9CA3AF]">–</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("h-9 text-xs gap-1 bg-white border-[#E5E7EB]", !customDateTo && "text-[#9CA3AF]")}>
                    <CalendarIcon className="h-3 w-3 text-[#06B6D4]" />{customDateTo ? format(customDateTo, 'MMM d') : 'To'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={customDateTo} onSelect={setCustomDateTo} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
          )}
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-[#E5E7EB]" />

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => (<Skeleton key={i} className="h-16 w-full rounded-lg" />))}</div>
      ) : paginated.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#E5E7EB] py-16 bg-white">
          <Inbox className="h-10 w-10 text-[#9CA3AF]" />
          <p className="mt-3 text-sm text-[#6B7280] font-medium">No tasks found</p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {paginated.map((sub) => {
              const cfg = STATUS_CONFIG[sub.status] ?? STATUS_CONFIG.in_review;
              const StatusIcon = cfg.icon;
              return (
                <Card key={sub.id} className="bg-white border border-[#E5E7EB] shadow-none cursor-pointer hover:border-[#06B6D4] transition-colors" onClick={() => openPreview(sub)}>
                  <CardContent className="flex items-center gap-4 p-4 py-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[rgba(6,182,212,0.08)]">
                      <StatusIcon className="h-5 w-5 text-[#06B6D4]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      {sub.id && (
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="font-mono text-[11px] font-semibold text-[#6B7280] tracking-wide truncate">
                            {formatTaskId(sub.id)}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(formatTaskId(sub.id));
                              toast.success('Task ID copied');
                            }}
                            aria-label="Copy Task ID"
                            className="inline-flex h-8 w-8 -m-1.5 items-center justify-center rounded text-[#9CA3AF] hover:text-[#0A1628] transition-colors cursor-pointer"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                      <p className="text-sm font-bold text-[#0A1628] break-words">{sub.task_title || 'Task'}</p>
                      <p className="text-xs text-[#9CA3AF] mt-0.5">{new Date(sub.created_at).toLocaleDateString()}</p>
                    </div>
                    <Badge variant={cfg.variant} className="shrink-0">{cfg.label}</Badge>
                    <ChevronRight className="h-4 w-4 shrink-0 text-[#06B6D4]" />
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
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
        </>
      )}

      {/* Preview Modal */}
      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{selected?.task_title || 'Task'}</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span>{new Date(selected.created_at).toLocaleDateString()}</span>
                <Badge variant={STATUS_CONFIG[selected.status]?.variant ?? 'secondary'}>{STATUS_CONFIG[selected.status]?.label ?? selected.status}</Badge>
              </div>
              {selected.text_content && (<div className="rounded-md border bg-muted/30 p-3"><p className="text-sm whitespace-pre-wrap">{selected.text_content}</p></div>)}
              {selected.file_url && previewUrl && (
                <div className="rounded-md border p-2">
                  {mediaType === 'image' && <img src={previewUrl} alt="Submission" className="w-full rounded-md object-contain max-h-80" />}
                  {mediaType === 'audio' && <audio controls className="w-full" src={previewUrl} />}
                  {mediaType === 'video' && <video controls className="w-full rounded-md max-h-80" src={previewUrl} />}
                  {mediaType === 'other' && <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline">Download file</a>}
                </div>
              )}
              {selected.file_url && !previewUrl && <Skeleton className="h-40 w-full rounded-md" />}
              {selected.notes && (<div className="space-y-1"><p className="text-xs font-medium text-muted-foreground">Reviewer Notes</p><p className="text-sm">{selected.notes}</p></div>)}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function inferMediaType(fileUrl: string | null | undefined): 'image' | 'audio' | 'video' | 'other' {
  if (!fileUrl) return 'other';
  const ext = fileUrl.split('.').pop()?.toLowerCase() ?? '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return 'image';
  if (['mp3', 'wav', 'ogg', 'aac', 'm4a'].includes(ext)) return 'audio';
  if (['mp4', 'webm', 'mov', 'avi'].includes(ext)) return 'video';
  return 'other';
}
