import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchAdminSubmissionsPage,
  updateSubmissionStatus,
  reverseSubmissionStatus,
  getSubmissionSignedUrl,
  claimSubmission,
  releaseSubmission,
} from '@/services/taskService';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  CheckCircle2, XCircle, Eye, Inbox, ArrowLeft, Search, Copy, Check, Lock,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import type { SubmissionStatus } from '@/types/task';
import { formatTaskId } from '@/lib/taskId';

const STATUS_CONFIG: Record<SubmissionStatus, { label: string; badgeClass: string }> = {
  in_review: { label: 'In Review', badgeClass: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-0' },
  approved: { label: 'Approved', badgeClass: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-0' },
  rejected: { label: 'Rejected', badgeClass: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-0' },
};

type FilterStatus = 'all' | SubmissionStatus;
const PAGE_SIZE = 30;

export default function ReviewTask() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [filter, setFilter] = useState<FilterStatus>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedSubmission, setSelectedSubmission] = useState<any | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState(false);
  const [rejectError, setRejectError] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [reversal, setReversal] = useState<{ sub: any; newStatus: 'approved' | 'rejected' } | null>(null);
  const [reversalReason, setReversalReason] = useState('');
  const [reversalError, setReversalError] = useState('');
  const claimedIdRef = useRef<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const handleCopyTaskId = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const short = formatTaskId(id);
    try {
      await navigator.clipboard.writeText(short);
      setCopiedId(id);
      toast.success(`Copied ${short}`);
      setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1500);
    } catch {
      toast.error('Failed to copy Task ID');
    }
  };

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const statusParam = filter === 'all' ? null : filter;

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['admin-submissions', taskId, statusParam, categoryFilter],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      fetchAdminSubmissionsPage({
        projectId: taskId,
        status: (statusParam as any) ?? undefined,
        cursor: pageParam,
        limit: PAGE_SIZE,
        categoryId: categoryFilter === 'all' ? null : categoryFilter,
      }),
    getNextPageParam: (last) => last.nextCursor,
    enabled: !!taskId,
  });

  // Categories for this project (for filter dropdown)
  const { data: projectCategories = [] } = useQuery({
    queryKey: ['project-categories', taskId],
    enabled: !!taskId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_categories')
        .select('id, category_name')
        .eq('project_id', taskId!)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data ?? []) as { id: string; category_name: string }[];
    },
  });

  const allRows = useMemo(
    () => (data?.pages.flatMap((p) => p.rows) ?? []),
    [data],
  );

  const { data: counts = { all: 0, pending: 0, approved: 0, rejected: 0 } } = useQuery({
    queryKey: ['admin-submission-counts', taskId],
    enabled: !!taskId,
    queryFn: async () => {
      const [allRes, pendingRes, approvedRes, rejectedRes] = await Promise.all([
        supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('project_id', taskId!),
        supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('project_id', taskId!).eq('status', 'in_review'),
        supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('project_id', taskId!).eq('status', 'approved'),
        supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('project_id', taskId!).eq('status', 'rejected'),
      ]);
      return {
        all: allRes.count ?? 0,
        pending: pendingRes.count ?? 0,
        approved: approvedRes.count ?? 0,
        rejected: rejectedRes.count ?? 0,
      };
    },
  });

  const taskName = (allRows[0] as any)?.task_title ?? 'Project Tasks';

  const visible = debouncedSearch
    ? allRows.filter((s) =>
        ((s as any).contributor_name ?? '').toLowerCase().includes(debouncedSearch.toLowerCase())
      )
    : allRows;

  // Infinite scroll observer
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasNextPage) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !isFetchingNextPage) {
        fetchNextPage();
      }
    }, { rootMargin: '300px' });
    obs.observe(node);
    return () => obs.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, visible.length]);

  const resolveSignedUrl = useCallback(async (sub: any) => {
    setMediaError(false);
    setSignedUrl(null);
    if (sub?.file_url) {
      const url = await getSubmissionSignedUrl(sub.file_url);
      setSignedUrl(url);
    }
  }, []);

  const openSubmission = async (sub: any) => {
    try {
      if (sub.status === 'in_review') {
        await claimSubmission(sub.id);
        claimedIdRef.current = sub.id;
      }
      setSelectedSubmission(sub);
      setReviewNotes('');
      setRejectError('');
      resolveSignedUrl(sub);
    } catch (e: any) {
      toast.error(
        e?.message?.includes('CLAIMED_BY_OTHER')
          ? 'Another admin is reviewing this submission'
          : (e?.message ?? 'Could not open submission'),
      );
    }
  };

  const closeSubmission = () => {
    if (claimedIdRef.current) {
      releaseSubmission(claimedIdRef.current);
      claimedIdRef.current = null;
    }
    setSelectedSubmission(null);
    setRejectError('');
  };

  useEffect(() => () => {
    if (claimedIdRef.current) {
      releaseSubmission(claimedIdRef.current);
      claimedIdRef.current = null;
    }
  }, []);

  const invalidateLists = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-submissions'] });
    queryClient.invalidateQueries({ queryKey: ['admin-submission-counts', taskId] });
  };

  const reviewMutation = useMutation({
    mutationFn: ({ id, status, notes }: { id: string; status: 'approved' | 'rejected'; notes?: string }) =>
      updateSubmissionStatus(id, status, notes),
    onSuccess: (_, { status }) => {
      invalidateLists();
      toast.success(`Task ${status}`);
      claimedIdRef.current = null;
      setSelectedSubmission(null);
      setReviewNotes('');
      setRejectError('');
    },
    onError: (err: any) => toast.error(err.message),
  });

  const reversalMutation = useMutation({
    mutationFn: ({ id, newStatus, reason }: { id: string; newStatus: 'approved' | 'rejected'; reason: string }) =>
      reverseSubmissionStatus(id, newStatus, reason),
    onSuccess: () => {
      invalidateLists();
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      toast.success('Status updated successfully');
      setReversal(null);
      setReversalReason('');
      setReversalError('');
      setSelectedSubmission(null);
    },
    onError: (err: any) => {
      const msg = err?.message ?? 'Failed to update status';
      setReversalError(msg);
      toast.error(msg);
    },
  });

  const openReversal = (sub: any, newStatus: 'approved' | 'rejected') => {
    setReversal({ sub, newStatus });
    setReversalReason('');
    setReversalError('');
  };

  const submitReversal = () => {
    if (!reversal) return;
    if (!reversalReason.trim()) {
      setReversalError('Please provide a reason for this change');
      return;
    }
    reversalMutation.mutate({
      id: reversal.sub.id,
      newStatus: reversal.newStatus,
      reason: reversalReason.trim(),
    });
  };

  const handleQuickAction = (sub: any, status: 'approved' | 'rejected') => {
    if (status === 'rejected') {
      openSubmission(sub);
      return;
    }
    reviewMutation.mutate({ id: sub.id, status });
  };

  const handleDetailedReview = (status: 'approved' | 'rejected') => {
    if (!selectedSubmission) return;
    if (status === 'rejected' && !reviewNotes.trim()) {
      setRejectError('Feedback is required when rejecting a submission');
      return;
    }
    setRejectError('');
    reviewMutation.mutate({ id: selectedSubmission.id, status, notes: reviewNotes.trim() || undefined });
  };

  const filters: { key: FilterStatus; label: string }[] = [
    { key: 'all', label: `All (${counts.all})` },
    { key: 'in_review', label: `In Review (${counts.pending})` },
    { key: 'approved', label: `Approved (${counts.approved})` },
    { key: 'rejected', label: `Rejected (${counts.rejected})` },
  ];

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin/review')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="font-display text-2xl font-bold">{taskName}</h1>
          <p className="text-sm text-muted-foreground">{counts.all} total tasks</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by contributor name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Filter bar */}
      <div className="flex gap-2 flex-wrap">
        {filters.map((f) => (
          <Button
            key={f.key}
            variant={filter === f.key ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {/* Category filter — only when this project has categories */}
      {projectCategories.length > 0 && (
        <div className="flex gap-2 flex-wrap items-center">
          <span className="text-xs font-medium text-muted-foreground mr-1">Category:</span>
          <Button
            variant={categoryFilter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setCategoryFilter('all')}
          >
            All Categories
          </Button>
          {projectCategories.map((c) => (
            <Button
              key={c.id}
              variant={categoryFilter === c.id ? 'default' : 'outline'}
              size="sm"
              onClick={() => setCategoryFilter(c.id)}
            >
              {c.category_name}
            </Button>
          ))}
        </div>
      )}

      {/* Submissions */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">Loading…</div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12">
          <Inbox className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {debouncedSearch ? 'No tasks match your search' : 'No tasks found'}
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((sub: any) => {
              const cfg = STATUS_CONFIG[sub.status as SubmissionStatus];
              const claimActive =
                sub.claimed_by &&
                sub.claimed_at &&
                new Date(sub.claimed_at).getTime() > Date.now() - 10 * 60 * 1000;
              return (
                <Card key={sub.id} className="border shadow-sm hover:shadow-md transition-shadow overflow-hidden">
                  <SubmissionPreview sub={sub} />
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{sub.contributor_name}</p>
                        <button
                          onClick={(e) => handleCopyTaskId(e, sub.id)}
                          title="Click to copy Task ID"
                          className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-mono text-muted-foreground hover:text-primary group"
                        >
                          ID: {formatTaskId(sub.id)}
                          {copiedId === sub.id
                            ? <Check className="h-3 w-3 text-success" />
                            : <Copy className="h-3 w-3 opacity-50 group-hover:opacity-100" />}
                        </button>
                      </div>
                      <Badge variant="outline" className={cfg.badgeClass}>{cfg.label}</Badge>
                    </div>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(sub.created_at), 'MMM d, yyyy HH:mm')}
                      </p>
                      {sub.selected_category_name && (
                        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-[10px] font-medium">
                          {sub.selected_category_name}
                        </Badge>
                      )}
                    </div>
                    {claimActive && sub.status === 'in_review' && (
                      <p className="inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
                        <Lock className="h-3 w-3" /> Being reviewed by another admin
                      </p>
                    )}
                    {sub.notes && sub.status === 'rejected' && (
                      <p className="text-xs text-destructive truncate">Feedback: {sub.notes}</p>
                    )}
                    <div className="flex items-center gap-1 pt-1">
                      <Button
                        variant="ghost" size="sm" className="h-8 flex-1"
                        onClick={() => openSubmission(sub)}
                      >
                        <Eye className="h-4 w-4 mr-1" /> View
                      </Button>
                      {sub.status === 'in_review' && (
                        <>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-primary hover:text-primary" onClick={() => handleQuickAction(sub, 'approved')} disabled={reviewMutation.isPending}>
                            <CheckCircle2 className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleQuickAction(sub, 'rejected')} disabled={reviewMutation.isPending}>
                            <XCircle className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                      {sub.status === 'approved' && (
                        <Button variant="outline" size="sm" className="h-8 text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => openReversal(sub, 'rejected')}>
                          Mark as Rejected
                        </Button>
                      )}
                      {sub.status === 'rejected' && (
                        <Button variant="outline" size="sm" className="h-8 text-primary border-primary/30 hover:bg-primary/10" onClick={() => openReversal(sub, 'approved')}>
                          Mark as Approved
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div ref={sentinelRef} className="h-10" />
          {isFetchingNextPage && (
            <div className="text-center text-sm text-muted-foreground py-2">Loading more…</div>
          )}
          {!hasNextPage && visible.length > 0 && (
            <div className="text-center text-xs text-muted-foreground py-2">End of list</div>
          )}
        </>
      )}

      {/* Detail modal */}
      <Dialog open={!!selectedSubmission} onOpenChange={(open) => { if (!open) closeSubmission(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Review Task</DialogTitle>
          </DialogHeader>
          {selectedSubmission && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-muted-foreground">Contributor</p><p className="font-medium">{selectedSubmission.contributor_name}</p></div>
                <div><p className="text-muted-foreground">Type</p><p className="font-medium capitalize">{selectedSubmission.task_media_type}</p></div>
                <div><p className="text-muted-foreground">Submitted</p><p className="font-medium">{format(new Date(selectedSubmission.created_at), 'MMM d, yyyy HH:mm')}</p></div>
                <div><p className="text-muted-foreground">Status</p><Badge variant="outline" className={STATUS_CONFIG[selectedSubmission.status as SubmissionStatus].badgeClass}>{STATUS_CONFIG[selectedSubmission.status as SubmissionStatus].label}</Badge></div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Content</p>
                {selectedSubmission.text_content ? (
                  <div className="rounded-lg bg-muted p-4 text-sm whitespace-pre-wrap max-h-64 overflow-auto">{selectedSubmission.text_content}</div>
                ) : selectedSubmission.external_url ? (
                  <div className="rounded-lg border bg-muted/40 p-4 space-y-3">
                    <p className="text-xs text-muted-foreground break-all">{selectedSubmission.external_url}</p>
                    <Button asChild variant="default" size="sm">
                      <a href={selectedSubmission.external_url} target="_blank" rel="noopener noreferrer">
                        Open Submission Link
                      </a>
                    </Button>
                  </div>
                ) : selectedSubmission.file_url ? (
                  <div className="space-y-2">
                    {!signedUrl ? (
                      <p className="text-sm text-muted-foreground">Loading media…</p>
                    ) : mediaError ? (
                      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-center space-y-2">
                        <p className="text-muted-foreground">Unable to load file</p>
                        <a href={signedUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline text-xs">Open in new tab</a>
                      </div>
                    ) : selectedSubmission.task_media_type === 'image' ? (
                      <img src={signedUrl} alt="Submission" className="w-full max-h-80 object-contain rounded-lg border bg-muted" onError={() => setMediaError(true)} />
                    ) : selectedSubmission.task_media_type === 'audio' ? (
                      <audio controls className="w-full" src={signedUrl} onError={() => setMediaError(true)} />
                    ) : selectedSubmission.task_media_type === 'video' ? (
                      <video controls className="w-full max-h-80 rounded-lg" src={signedUrl} onError={() => setMediaError(true)} />
                    ) : (
                      <a href={signedUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline">Download file</a>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">No content available</p>
                )}
              </div>

              {selectedSubmission.status === 'in_review' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Review Notes <span className="text-muted-foreground">(required for rejection)</span>
                  </label>
                  <Textarea placeholder="Add feedback…" value={reviewNotes} onChange={(e) => { setReviewNotes(e.target.value); setRejectError(''); }} rows={3} className="resize-none" />
                  {rejectError && <p className="text-xs text-destructive">{rejectError}</p>}
                </div>
              )}

              {selectedSubmission.notes && selectedSubmission.status !== 'in_review' && (
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">Admin Feedback</p>
                  <p className="text-sm bg-muted rounded-lg p-3">{selectedSubmission.notes}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            {selectedSubmission?.status === 'in_review' ? (
              <div className="flex w-full gap-2">
                <Button variant="outline" className="flex-1 text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => handleDetailedReview('rejected')} disabled={reviewMutation.isPending}>
                  <XCircle className="h-4 w-4 mr-1" /> Reject
                </Button>
                <Button className="flex-1" onClick={() => handleDetailedReview('approved')} disabled={reviewMutation.isPending}>
                  <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
                </Button>
              </div>
            ) : (
              <div className="flex w-full justify-between gap-2">
                {selectedSubmission?.status === 'approved' && (
                  <Button variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => openReversal(selectedSubmission, 'rejected')}>
                    Mark as Rejected
                  </Button>
                )}
                {selectedSubmission?.status === 'rejected' && (
                  <Button variant="outline" className="text-primary border-primary/30 hover:bg-primary/10" onClick={() => openReversal(selectedSubmission, 'approved')}>
                    Mark as Approved
                  </Button>
                )}
                <Button variant="outline" onClick={() => setSelectedSubmission(null)}>Close</Button>
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reversal confirmation dialog */}
      <Dialog open={!!reversal} onOpenChange={(open) => { if (!open) { setReversal(null); setReversalReason(''); setReversalError(''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">
              {reversal?.newStatus === 'rejected' ? 'Reverse approval?' : 'Approve previously rejected submission?'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              {reversal?.newStatus === 'rejected'
                ? "This will reverse the user's earnings. Continue?"
                : "This will credit the user's wallet. Continue?"}
            </p>
            <div className="space-y-1">
              <label className="text-sm font-medium">Reason <span className="text-muted-foreground">(required)</span></label>
              <Textarea
                rows={3}
                placeholder="Why are you changing this status?"
                value={reversalReason}
                onChange={(e) => { setReversalReason(e.target.value); setReversalError(''); }}
                className="resize-none"
              />
              {reversalError && <p className="text-xs text-destructive">{reversalError}</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReversal(null)} disabled={reversalMutation.isPending}>Cancel</Button>
            <Button
              variant={reversal?.newStatus === 'rejected' ? 'destructive' : 'default'}
              onClick={submitReversal}
              disabled={reversalMutation.isPending}
            >
              {reversalMutation.isPending ? 'Updating…' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SubmissionPreview({ sub }: { sub: any }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const mediaType = sub.task_media_type;

  useEffect(() => {
    let active = true;
    if (sub.file_url) {
      getSubmissionSignedUrl(sub.file_url).then((u) => { if (active) setUrl(u); });
    }
    return () => { active = false; };
  }, [sub.file_url]);

  if (sub.text_content) {
    return (
      <div className="bg-muted/40 border-b px-4 py-3 max-h-24 overflow-hidden">
        <p className="text-xs text-muted-foreground line-clamp-3 whitespace-pre-wrap">{sub.text_content}</p>
      </div>
    );
  }
  if (sub.external_url) {
    return (
      <div className="bg-muted/40 border-b px-4 py-3 flex items-center gap-2">
        <span className="text-xs text-muted-foreground truncate flex-1">🔗 {sub.external_url}</span>
      </div>
    );
  }
  if (!sub.file_url) return null;
  if (!url) return <div className="h-32 bg-muted/40 animate-pulse" />;
  if (error) return <div className="h-32 bg-muted/40 flex items-center justify-center text-xs text-muted-foreground">Preview unavailable</div>;

  if (mediaType === 'image') {
    return <img src={url} alt="" loading="lazy" className="w-full h-40 object-cover bg-muted" onError={() => setError(true)} />;
  }
  if (mediaType === 'video') {
    return <video src={url} controls preload="metadata" className="w-full h-40 object-cover bg-black" onError={() => setError(true)} />;
  }
  if (mediaType === 'audio') {
    return <div className="px-4 py-3 bg-muted/30 border-b"><audio src={url} controls className="w-full h-10" onError={() => setError(true)} /></div>;
  }
  return null;
}
