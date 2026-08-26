import { supabase } from '@/integrations/supabase/client';
import type { Submission, SubmissionInsert } from '@/types/task';

// NOTE: The DB table for contributor submissions is now `tasks`.
// We keep the TS file/type name `Submission` for app-side semantics.

export async function createSubmission(submission: SubmissionInsert): Promise<Submission> {
  const { data, error } = await supabase
    .from('tasks')
    .insert(submission as any)
    .select()
    .single();

  if (error) throw error;
  return data as unknown as Submission;
}

export async function fetchUserSubmissionCount(userId: string, projectId: string): Promise<number> {
  if (!userId || userId === 'undefined') return 0;
  const { count, error } = await supabase
    .from('tasks')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('project_id', projectId);

  if (error) throw error;
  return count ?? 0;
}

export async function fetchMySubmissions(): Promise<(Submission & { task_title?: string; task_media_type?: string })[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*, projects(title, media_type)')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return ((data ?? []) as any[]).map((row) => ({
    ...row,
    task_title: row.projects?.title ?? 'Submission',
    task_media_type: row.projects?.media_type ?? undefined,
    projects: undefined,
  }));
}

export interface AdminSubmissionRow extends Submission {
  task_title?: string;
  task_media_type?: string;
  task_start_date?: string | null;
  task_end_date?: string | null;
  task_pay?: number;
  contributor_name?: string;
  claimed_by?: string | null;
  claimed_at?: string | null;
  selected_category_id?: string | null;
  selected_category_name?: string | null;
}

export interface AdminSubmissionsPage {
  rows: AdminSubmissionRow[];
  nextCursor: string | null;
}

/**
 * Server-paginated admin submissions list. Uses created_at as a stable cursor.
 * Pass `cursor = null` for the first page; use the returned `nextCursor` for
 * subsequent pages. Returns up to `limit` rows (max 100).
 */
export async function fetchAdminSubmissionsPage(opts: {
  status?: 'in_review' | 'approved' | 'rejected' | null;
  projectId?: string | null;
  cursor?: string | null;
  limit?: number;
  categoryId?: string | null;
} = {}): Promise<AdminSubmissionsPage> {
  const limit = Math.min(Math.max(opts.limit ?? 30, 1), 100);
  const { data, error } = await supabase.rpc('admin_list_submissions' as any, {
    _status: opts.status ?? null,
    _project_id: opts.projectId ?? null,
    _cursor: opts.cursor ?? null,
    _limit: limit,
    _category_id: opts.categoryId ?? null,
  });
  if (error) throw error;
  const rows = ((data ?? []) as any[]) as AdminSubmissionRow[];
  const nextCursor = rows.length === limit ? rows[rows.length - 1].created_at as unknown as string : null;
  return { rows, nextCursor };
}

/**
 * Loads ALL admin submissions by paging through `admin_list_submissions`.
 * Used by aggregate views (project-level summary). For row-level lists, use
 * `fetchAdminSubmissionsPage` with cursor pagination instead.
 */
export async function fetchAllSubmissions(): Promise<AdminSubmissionRow[]> {
  const out: AdminSubmissionRow[] = [];
  let cursor: string | null = null;
  // Cap to avoid runaway loops.
  for (let i = 0; i < 200; i++) {
    const page = await fetchAdminSubmissionsPage({ cursor, limit: 100 });
    out.push(...page.rows);
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return out;
}

/** Admin-only: claim a submission for review (10-min lock). */
export async function claimSubmission(submissionId: string): Promise<void> {
  const { error } = await supabase.rpc('claim_submission' as any, {
    _submission_id: submissionId,
  });
  if (error) throw error;
}

/** Admin-only: release a previously claimed submission. */
export async function releaseSubmission(submissionId: string): Promise<void> {
  const { error } = await supabase.rpc('release_submission' as any, {
    _submission_id: submissionId,
  });
  if (error) {
    // Releasing is best-effort; surface only as a console warning.
    console.warn('release_submission failed:', error.message);
  }
}

export async function updateSubmissionStatus(
  id: string,
  status: 'approved' | 'rejected',
  notes?: string,
): Promise<void> {
  const updates: any = { status };
  if (notes !== undefined) updates.notes = notes;

  const { error } = await supabase
    .from('tasks')
    .update(updates)
    .eq('id', id);

  if (error) throw error;
}

/**
 * Admin-only: reverse a submission's decision (approved <-> rejected).
 * Atomically adjusts wallet, earnings, tokens and writes an audit log entry.
 */
export async function reverseSubmissionStatus(
  submissionId: string,
  newStatus: 'approved' | 'rejected',
  reason: string,
): Promise<void> {
  const { error } = await supabase.rpc('update_submission_status_admin' as any, {
    _submission_id: submissionId,
    _new_status: newStatus,
    _reason: reason,
  });
  if (error) throw error;
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

/**
 * Uploads a contributor submission file using the structured layout:
 *   {project_id}/{user_id}/{taskUuid}/{timestamp}_{filename}
 *
 * Storage RLS requires user_id at folder index [2]. taskUuid groups
 * all files belonging to a single submission attempt.
 */
export async function uploadSubmissionFile(
  userId: string,
  projectId: string,
  file: File,
  taskUuid?: string,
): Promise<string> {
  if (!projectId || !userId) {
    throw new Error('project_id and user_id are required for upload');
  }
  const taskFolder = taskUuid ?? crypto.randomUUID();
  const fileName = `${Date.now()}_${sanitizeFileName(file.name)}`;
  const path = `${projectId}/${userId}/${taskFolder}/${fileName}`;

  const { error } = await supabase.storage
    .from('submissions')
    .upload(path, file, {
      upsert: false,
      contentType: file.type,
      resumable: true,
    });

  if (error) throw error;

  return path;
}

export async function getSubmissionSignedUrl(path: string): Promise<string | null> {
  if (!path) return null;
  if (path.startsWith('http')) return path;

  const { data, error } = await supabase.storage
    .from('submissions')
    .createSignedUrl(path, 3600);

  if (error || !data?.signedUrl) {
    console.error('Failed to create signed URL:', error);
    return null;
  }
  return data.signedUrl;
}

/** Claims an exclusive work item for video annotation. */
export async function claimWorkItem(projectId: string): Promise<string> {
  const { data, error } = await supabase.rpc('claim_work_item', {
    _project_id: projectId,
  });
  if (error) throw error;
  return data as string;
}

/** Saves a batch of annotations to the database with version checks. */
export async function saveAnnotationsBatch(
  workItemId: string,
  clientVersion: number,
  annotations: any[]
): Promise<{ success: boolean; current_version: number; db_annotations: any[] }> {
  const { data, error } = await supabase.rpc('save_annotations_batch', {
    _work_item_id: workItemId,
    _client_version: clientVersion,
    _annotations: annotations,
  });
  if (error) throw error;
  return data[0] as any;
}
