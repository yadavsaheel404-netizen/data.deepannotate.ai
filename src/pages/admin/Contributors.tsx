import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Users, Inbox, MoreHorizontal, ShieldCheck, ShieldOff, UserX, UserCheck, Search, ChevronLeft, ChevronRight, Send, Download } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AppRole } from '@/types/user';

const PAGE_SIZE = 15;

interface ContributorRow {
  id: string;
  display_name: string | null;
  phone: string | null;
  language: string[] | null;
  country: string | null;
  skills: string[] | null;
  onboarding_complete: boolean;
  is_active: boolean;
  created_at: string;
  avatar_url: string | null;
  role: AppRole;
}

async function fetchContributors(): Promise<ContributorRow[]> {
  const { data: roles, error: rolesErr } = await supabase
    .from('user_roles')
    .select('user_id, role');
  if (rolesErr) throw rolesErr;
  if (!roles?.length) return [];

  const userIds = roles.map((r) => r.user_id);
  const { data: profiles, error: profilesErr } = await supabase
    .from('profiles')
    .select('id, display_name, phone, language, country, skills, onboarding_complete, is_active, created_at, avatar_url')
    .in('id', userIds)
    .order('created_at', { ascending: false });
  if (profilesErr) throw profilesErr;

  const roleMap = new Map(roles.map((r) => [r.user_id, r.role as AppRole]));
  return (profiles ?? []).map((p: any) => ({
    ...p,
    role: roleMap.get(p.id) ?? 'contributor',
  }));
}

export default function AdminContributors() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: contributors = [], isLoading } = useQuery({
    queryKey: ['admin-contributors'],
    queryFn: fetchContributors,
  });

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [countryFilter, setCountryFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [projectFilter, setProjectFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);

  // Load projects for project filter
  const { data: tasks = [] } = useQuery({
    queryKey: ['admin-projects-list'],
    queryFn: async () => {
      const { data, error } = await supabase.from('projects').select('id, title').order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset page on filter change
  useEffect(() => { setPage(0); }, [debouncedSearch, countryFilter, roleFilter, statusFilter, projectFilter, dateFrom, dateTo]);

  const filtered = useMemo(() => {
    let result = contributors;
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      result = result.filter((c) => {
        const nameMatch = c.display_name?.toLowerCase().includes(q);
        const skillMatch = c.skills?.some((s) => s.toLowerCase().includes(q));
        const countryMatch = c.country?.toLowerCase().includes(q);
        return nameMatch || skillMatch || countryMatch;
      });
    }
    if (countryFilter !== 'all') result = result.filter((c) => c.country === countryFilter);
    if (roleFilter !== 'all') result = result.filter((c) => c.role === roleFilter);
    if (statusFilter !== 'all') {
      result = result.filter((c) => (statusFilter === 'active' ? c.is_active : !c.is_active));
    }
    if (dateFrom) {
      const from = new Date(dateFrom).getTime();
      result = result.filter((c) => new Date(c.created_at).getTime() >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo).getTime() + 86400000;
      result = result.filter((c) => new Date(c.created_at).getTime() <= to);
    }
    return result;
  }, [contributors, debouncedSearch, countryFilter, roleFilter, statusFilter, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const [confirmAction, setConfirmAction] = useState<{
    type: 'role' | 'deactivate' | 'activate';
    userId: string;
    name: string;
    newRole?: AppRole;
  } | null>(null);

  const roleMutation = useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: AppRole }) => {
      const { error } = await supabase.from('user_roles').update({ role: newRole }).eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-contributors'] }); toast.success('Role updated'); setConfirmAction(null); },
    onError: (err: any) => toast.error(err.message),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ userId, isActive }: { userId: string; isActive: boolean }) => {
      const { error } = await supabase.from('profiles').update({ is_active: isActive }).eq('id', userId);
      if (error) throw error;
    },
    onSuccess: (_, { isActive }) => { queryClient.invalidateQueries({ queryKey: ['admin-contributors'] }); toast.success(isActive ? 'Account reactivated' : 'Account deactivated'); setConfirmAction(null); },
    onError: (err: any) => toast.error(err.message),
  });

  const handleConfirm = () => {
    if (!confirmAction) return;
    if (confirmAction.type === 'role' && confirmAction.newRole) {
      roleMutation.mutate({ userId: confirmAction.userId, newRole: confirmAction.newRole });
    } else if (confirmAction.type === 'deactivate') {
      statusMutation.mutate({ userId: confirmAction.userId, isActive: false });
    } else if (confirmAction.type === 'activate') {
      statusMutation.mutate({ userId: confirmAction.userId, isActive: true });
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === paginated.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginated.map((c) => c.id)));
    }
  };

  const isPending = roleMutation.isPending || statusMutation.isPending;
  const activeContributors = contributors.filter((c) => c.role === 'contributor');

  const exportCSV = useCallback(async () => {
    setExporting(true);
    try {
      const { data, error } = await supabase.functions.invoke('export-contributors', {
        body: {
          search: debouncedSearch || undefined,
          country: countryFilter,
          role: roleFilter,
          status: statusFilter,
          projectId: projectFilter,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        },
      });
      if (error) throw error;
      const rows: Record<string, any>[] = (data as any)?.rows ?? [];
      if (!rows.length) {
        toast.info('No contributors match the current filters');
        return;
      }
      const headers = Object.keys(rows[0]);
      const csv = [headers, ...rows.map((r) => headers.map((h) => r[h] ?? ''))]
        .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
        .join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `contributors_${format(new Date(), 'yyyy-MM-dd')}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${rows.length} contributor${rows.length !== 1 ? 's' : ''}`);
    } catch (err: any) {
      toast.error(err?.message ?? 'Export failed');
    } finally {
      setExporting(false);
    }
  }, [debouncedSearch, countryFilter, roleFilter, statusFilter, projectFilter, dateFrom, dateTo]);

  const confirmMessages: Record<string, { title: string; description: string }> = {
    role: {
      title: 'Change Role',
      description: `Promote "${confirmAction?.name}" to Admin? They will gain full platform management access.`,
    },
    deactivate: {
      title: 'Deactivate Account',
      description: `Deactivate "${confirmAction?.name}"? They will no longer be able to log in or submit tasks.`,
    },
    activate: {
      title: 'Reactivate Account',
      description: `Reactivate "${confirmAction?.name}"? They will regain access to the platform.`,
    },
  };

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Contributors</h1>
          <p className="text-sm text-muted-foreground">
            {contributors.length} user{contributors.length !== 1 && 's'} · {activeContributors.length} contributor{activeContributors.length !== 1 && 's'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={exporting}>
            <Download className="h-4 w-4 mr-1" /> {exporting ? 'Exporting…' : 'Export CSV'}
          </Button>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Users className="h-5 w-5 text-primary" />
          </div>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, skill, or country…"
              className="pl-9"
            />
          </div>
          <Select value={countryFilter} onValueChange={setCountryFilter}>
            <SelectTrigger className="w-full sm:w-[150px]"><SelectValue placeholder="Country" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Countries</SelectItem>
              <SelectItem value="India">India</SelectItem>
              <SelectItem value="Philippines">Philippines</SelectItem>
            </SelectContent>
          </Select>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-full sm:w-[140px]"><SelectValue placeholder="Role" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              <SelectItem value="contributor">Contributor</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <Select value={projectFilter} onValueChange={setProjectFilter}>
            <SelectTrigger className="w-full sm:w-[240px]"><SelectValue placeholder="Project (export only)" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Projects</SelectItem>
              {tasks.map((t: any) => (
                <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground whitespace-nowrap">Joined from</span>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-[160px]" />
            <span className="text-xs text-muted-foreground">to</span>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-[160px]" />
            {(dateFrom || dateTo) && (
              <Button variant="ghost" size="sm" onClick={() => { setDateFrom(''); setDateTo(''); }}>Clear</Button>
            )}
          </div>
        </div>
      </div>

      {/* Bulk actions bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <Button size="sm" variant="outline" onClick={() => navigate('/admin/communications')}>
            <Send className="h-3 w-3 mr-1" /> Send Notification
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>Clear</Button>
        </div>
      )}

      <div className="rounded-lg border border-border bg-card shadow-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={paginated.length > 0 && selectedIds.size === paginated.length}
                  onCheckedChange={toggleSelectAll}
                />
              </TableHead>
              <TableHead>User</TableHead>
              <TableHead>Country</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={7}><Skeleton className="h-8 w-full" /></TableCell>
                </TableRow>
              ))
            ) : paginated.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12">
                  <div className="flex flex-col items-center gap-2">
                    <Inbox className="h-8 w-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">{debouncedSearch ? 'No results found' : 'No users yet'}</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              paginated.map((c) => {
                const initials = (c.display_name || '?').slice(0, 2).toUpperCase();
                return (
                  <TableRow key={c.id} className={`${!c.is_active ? 'opacity-50' : ''} cursor-pointer`}>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={selectedIds.has(c.id)} onCheckedChange={() => toggleSelect(c.id)} />
                    </TableCell>
                    <TableCell onClick={() => navigate(`/admin/contributors/${c.id}`)}>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          {c.avatar_url && <AvatarImage src={c.avatar_url} alt={c.display_name || 'avatar'} />}
                          <AvatarFallback className="bg-primary/10 text-primary text-xs font-display">{initials}</AvatarFallback>
                        </Avatar>
                        <div>
                          <span className="text-sm font-medium">{c.display_name || 'Unnamed'}</span>
                          {c.skills && c.skills.length > 0 && (
                            <p className="text-xs text-muted-foreground">{c.skills.slice(0, 2).join(', ')}{c.skills.length > 2 ? ` +${c.skills.length - 2}` : ''}</p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell onClick={() => navigate(`/admin/contributors/${c.id}`)}>
                      <span className="text-sm">{c.country || '—'}</span>
                    </TableCell>
                    <TableCell onClick={() => navigate(`/admin/contributors/${c.id}`)}>
                      <Badge variant={c.role === 'admin' ? 'default' : 'secondary'} className="capitalize">{c.role}</Badge>
                    </TableCell>
                    <TableCell onClick={() => navigate(`/admin/contributors/${c.id}`)}>
                      <Badge variant={c.is_active ? 'default' : 'destructive'}>{c.is_active ? 'Active' : 'Inactive'}</Badge>
                    </TableCell>
                    <TableCell onClick={() => navigate(`/admin/contributors/${c.id}`)}>
                      <span className="text-sm text-muted-foreground">{format(new Date(c.created_at), 'MMM d, yyyy')}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {c.role === 'contributor' ? (
                              <DropdownMenuItem onClick={() => setConfirmAction({ type: 'role', userId: c.id, name: c.display_name || 'User', newRole: 'admin' })}>
                                <ShieldCheck className="h-4 w-4 mr-2" />Promote to Admin
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onClick={() => setConfirmAction({ type: 'role', userId: c.id, name: c.display_name || 'User', newRole: 'contributor' })}>
                                <ShieldOff className="h-4 w-4 mr-2" />Demote to Contributor
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            {c.is_active ? (
                              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setConfirmAction({ type: 'deactivate', userId: c.id, name: c.display_name || 'User' })}>
                                <UserX className="h-4 w-4 mr-2" />Deactivate
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onClick={() => setConfirmAction({ type: 'activate', userId: c.id, name: c.display_name || 'User' })}>
                                <UserCheck className="h-4 w-4 mr-2" />Reactivate
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

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

      <AlertDialog open={!!confirmAction} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmAction ? confirmMessages[confirmAction.type].title : ''}</AlertDialogTitle>
            <AlertDialogDescription>{confirmAction ? confirmMessages[confirmAction.type].description : ''}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} disabled={isPending}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
