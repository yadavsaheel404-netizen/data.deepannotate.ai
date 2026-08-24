import { supabase } from '@/integrations/supabase/client';
import type { Task, TaskInsert } from '@/types/project';

// NOTE: The DB table for gigs/projects is now `projects`.
// We keep the TS type name `Task` for app-side semantics.

export interface FetchTasksParams {
  page?: number;
  pageSize?: number;
  search?: string;
  statusFilter?: string;
  sortColumn?: 'visible_till' | 'status';
  sortDirection?: 'asc' | 'desc';
}

export interface FetchTasksResult {
  tasks: Task[];
  count: number;
}

export async function fetchTasksPaginated(params: FetchTasksParams = {}): Promise<FetchTasksResult> {
  const { page = 0, pageSize = 15, search, statusFilter, sortColumn, sortDirection } = params;

  let query = supabase
    .from('projects')
    .select('*', { count: 'exact' });

  if (search) {
    query = query.ilike('title', `%${search}%`);
  }

  if (statusFilter && statusFilter !== 'all') {
    query = query.eq('status', statusFilter as any);
  }

  if (sortColumn && sortDirection) {
    const nullsFirst = sortDirection === 'desc';
    query = query.order(sortColumn, { ascending: sortDirection === 'asc', nullsFirst });
  } else {
    query = query.order('created_at', { ascending: false });
  }

  const from = page * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) throw error;
  return { tasks: (data ?? []) as unknown as Task[], count: count ?? 0 };
}

export async function createTask(task: TaskInsert): Promise<Task> {
  const { data, error } = await supabase
    .from('projects')
    .insert(task as any)
    .select()
    .single();

  if (error) throw error;
  return data as unknown as Task;
}

export async function fetchTasks(): Promise<Task[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as unknown as Task[];
}

export async function fetchActiveTasks(language?: string): Promise<Task[]> {
  // Use RPC that filters by the signed-in user's profile attributes and returns aggregated counts server-side
  const { data, error } = await (supabase as any).rpc('get_visible_projects_with_counts');

  if (error) throw error;
  return (data ?? []) as unknown as Task[];
}

export async function fetchProjectSubmissionsCount(projectId: string): Promise<number> {
  const { count, error } = await supabase
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId);
  if (error) throw error;
  return count ?? 0;
}

export async function updateTask(id: string, updates: Partial<TaskInsert>): Promise<Task> {
  console.log('[updateTask] payload', { id, updates });

  // If slots are being changed, recompute status based on current submission fill.
  let finalUpdates: Partial<TaskInsert> = { ...updates };

  if (typeof updates.total_tasks === 'number') {
    if (updates.total_tasks < 1) {
      throw new Error('Slots must be at least 1');
    }

    const { data: current, error: fetchErr } = await supabase
      .from('projects')
      .select('filled_tasks, status')
      .eq('id', id)
      .single();
    if (fetchErr) throw fetchErr;

    const filled = current?.filled_tasks ?? 0;
    const currentStatus = current?.status as string | undefined;

    // Only auto-toggle between active/closed via 'completed'.
    // Don't override manual draft/paused states unless user explicitly set status.
    if (updates.status === undefined && (currentStatus === 'active' || currentStatus === 'completed')) {
      finalUpdates.status = (filled >= updates.total_tasks ? 'completed' : 'active') as any;
    }
  }

  const { data, error, count } = await supabase
    .from('projects')
    .update(finalUpdates as any, { count: 'exact' })
    .eq('id', id)
    .select()
    .single();

  console.log('[updateTask] response', { data, error, count });

  if (error) throw error;
  if (!data) throw new Error('Update failed: no rows affected');
  return data as unknown as Task;
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function fetchMyLatestDraft(userId: string): Promise<Task | null> {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('created_by', userId)
    .eq('status', 'draft')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as Task) ?? null;
}

export async function searchTaskSuggestions(query: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('title')
    .ilike('title', `%${query}%`)
    .limit(5);

  if (error) throw error;
  return (data ?? []).map((t: any) => t.title);
}
