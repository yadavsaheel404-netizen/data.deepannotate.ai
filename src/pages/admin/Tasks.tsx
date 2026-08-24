import { useState, useCallback, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { fetchTasksPaginated, deleteTask, updateTask, searchTaskSuggestions } from '@/services/projectService';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious,
} from '@/components/ui/pagination';
import { Plus, MoreHorizontal, Play, Pause, Trash2, Pencil, Search, ArrowUp, ArrowDown, AlertTriangle, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import type { Task, TaskStatus } from '@/types/project';
import { getEffectiveTaskStatus } from '@/lib/taskStatus';
import { EditTaskDialog } from '@/components/admin/EditTaskDialog';

const PAGE_SIZE = 15;

const statusColors: Record<TaskStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  active: 'bg-primary/15 text-primary',
  paused: 'bg-warning/15 text-warning',
  completed: 'bg-muted text-muted-foreground',
};

const mediaIcons: Record<string, string> = {
  text: '📝', audio: '🎙️', image: '📸', video: '🎬',
};

type SortState = { column: 'visible_till' | 'status'; direction: 'asc' | 'desc' } | null;

function canReactivate(task: Task): { allowed: boolean; reason?: string } {
  if (task.end_date && new Date(task.end_date) < new Date()) return { allowed: false, reason: 'Task end date has passed' };
  if (task.visible_till && new Date(task.visible_till) < new Date()) return { allowed: false, reason: 'Task visibility date has passed' };
  if (task.filled_tasks >= task.total_tasks) return { allowed: false, reason: 'All tasks are filled' };
  return { allowed: true };
}

export default function AdminTasks() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sort, setSort] = useState<SortState>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(0); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (search.length < 2) { setSuggestions([]); return; }
    const t = setTimeout(async () => {
      try { const results = await searchTaskSuggestions(search); setSuggestions(results); setShowSuggestions(true); } catch { /* ignore */ }
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowSuggestions(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-tasks', page, debouncedSearch, statusFilter, sort?.column, sort?.direction],
    queryFn: () => fetchTasksPaginated({
      page, pageSize: PAGE_SIZE, search: debouncedSearch || undefined,
      statusFilter, sortColumn: sort?.column, sortDirection: sort?.direction,
    }),
  });

  const tasks = data?.tasks ?? [];
  const totalCount = data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const deleteMutation = useMutation({
    mutationFn: deleteTask,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-tasks'] }); toast.success('Project deleted'); },
    onError: (err: any) => toast.error(err.message),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: TaskStatus }) => updateTask(id, { status } as any),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-tasks'] }); toast.success('Status updated'); },
    onError: (err: any) => toast.error(err.message),
  });

  const handleReactivate = (task: Task) => {
    const check = canReactivate(task);
    if (!check.allowed) {
      toast.error(check.reason || 'Project cannot be activated: expired or full');
      return;
    }
    statusMutation.mutate({ id: task.id, status: 'active' });
  };

  const toggleSort = useCallback((column: 'visible_till' | 'status') => {
    setSort(prev => {
      if (!prev || prev.column !== column) return { column, direction: 'asc' };
      if (prev.direction === 'asc') return { column, direction: 'desc' };
      return null;
    });
    setPage(0);
  }, []);

  const SortIndicator = ({ column }: { column: 'visible_till' | 'status' }) => {
    if (!sort || sort.column !== column) return null;
    return sort.direction === 'asc' ? <ArrowUp className="h-3 w-3 inline ml-1" /> : <ArrowDown className="h-3 w-3 inline ml-1" />;
  };

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Projects</h1>
          <p className="text-sm text-muted-foreground">Create and manage data collection projects</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <Button variant="hero" className="w-full sm:w-auto" onClick={() => navigate('/admin/create-task')}>
            <Plus className="h-4 w-4 mr-1" /> Create New Project
          </Button>
          <Button variant="hero" className="w-full sm:w-auto" onClick={() => navigate('/admin/create-task?type=category')}>
            <Plus className="h-4 w-4 mr-1" /> Create Category Project
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="relative flex-1 max-w-sm" ref={searchRef}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search projects…" value={search} onChange={(e) => setSearch(e.target.value)} onFocus={() => suggestions.length > 0 && setShowSuggestions(true)} className="pl-9" />
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute z-50 top-full mt-1 w-full bg-popover border border-border rounded-md shadow-md overflow-hidden">
              {suggestions.map((s, i) => (
                <button key={i} className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors" onMouseDown={() => { setSearch(s); setShowSuggestions(false); }}>{s}</button>
              ))}
            </div>
          )}
        </div>
        <Tabs value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="active">Active</TabsTrigger>
            <TabsTrigger value="draft">Draft</TabsTrigger>
            <TabsTrigger value="paused">Paused</TabsTrigger>
            <TabsTrigger value="completed">Completed</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="rounded-lg border border-border bg-card shadow-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Project</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Tasks</TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('visible_till')}>Visible Till <SortIndicator column="visible_till" /></TableHead>
              <TableHead>Languages</TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('status')}>Status <SortIndicator column="status" /></TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 7 }).map((_, j) => (<TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>))}</TableRow>
              ))
            ) : tasks.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                  {debouncedSearch ? 'No results found.' : 'No projects yet. Create your first project to get started.'}
                </TableCell>
              </TableRow>
            ) : (
              tasks.map((task: Task) => {
                const effective = getEffectiveTaskStatus(task);
                const isStale = task.status === 'active' && effective === 'closed';
                const isClosedOrPaused = task.status === 'paused' || task.status === 'completed' || isStale;

                return (
                  <TableRow key={task.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{task.title}</p>
                        <p className="text-xs text-muted-foreground truncate max-w-[200px]">{task.instructions.replace(/<[^>]*>/g, '')}</p>
                      </div>
                    </TableCell>
                    <TableCell><span className="text-sm">{mediaIcons[task.media_type]} {task.media_type}</span></TableCell>
                    <TableCell>
                      <span className={`text-sm font-medium ${task.filled_tasks >= task.total_tasks ? 'text-destructive' : ''}`}>
                        {Math.min(task.filled_tasks, task.total_tasks)}/{task.total_tasks}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {task.visible_till ? format(new Date(task.visible_till), 'MMM d, yyyy') : '—'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {task.languages.map((l) => (<Badge key={l} variant="secondary" className="text-xs">{l}</Badge>))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Badge className={isStale ? 'bg-destructive/15 text-destructive' : statusColors[task.status]}>
                          {isStale ? 'closed' : task.status}
                        </Badge>
                        {isStale && (
                          <span title="Deadline passed or all tasks filled — consider closing this project">
                            <AlertTriangle className="h-4 w-4 text-amber-500" />
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setEditTask(task)}>
                            <Pencil className="h-4 w-4 mr-2" /> Edit
                          </DropdownMenuItem>
                          {task.status === 'draft' && (
                            <DropdownMenuItem onClick={() => handleReactivate(task)}>
                              <Play className="h-4 w-4 mr-2" /> Activate
                            </DropdownMenuItem>
                          )}
                          {task.status === 'active' && !isStale && (
                            <DropdownMenuItem onClick={() => statusMutation.mutate({ id: task.id, status: 'paused' })}>
                              <Pause className="h-4 w-4 mr-2" /> Pause
                            </DropdownMenuItem>
                          )}
                          {(task.status === 'paused' || task.status === 'completed' || isStale) && (
                            <DropdownMenuItem onClick={() => handleReactivate(task)}>
                              <RotateCcw className="h-4 w-4 mr-2" /> Reactivate
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem className="text-destructive" onClick={() => deleteMutation.mutate(task.id)}>
                            <Trash2 className="h-4 w-4 mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious onClick={() => setPage(p => Math.max(0, p - 1))} className={page === 0 ? 'pointer-events-none opacity-50' : 'cursor-pointer'} />
            </PaginationItem>
            {Array.from({ length: totalPages }).map((_, i) => (
              <PaginationItem key={i}>
                <PaginationLink isActive={i === page} onClick={() => setPage(i)} className="cursor-pointer">{i + 1}</PaginationLink>
              </PaginationItem>
            ))}
            <PaginationItem>
              <PaginationNext onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} className={page >= totalPages - 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'} />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}

      <EditTaskDialog task={editTask} open={!!editTask} onOpenChange={(open) => !open && setEditTask(null)} />
    </div>
  );
}
