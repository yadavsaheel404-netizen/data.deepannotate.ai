import type { Task } from '@/types/project';

/**
 * Compute the effective display status of a task.
 * Single source of truth — used by both contributor and admin views.
 */
export type EffectiveTaskStatus = 'active' | 'closed' | 'draft' | 'paused' | 'completed';

export function getEffectiveTaskStatus(task: Task): EffectiveTaskStatus {
  // Manual statuses take precedence
  if (task.status === 'draft') return 'draft';
  if (task.status === 'paused') return 'paused';
  if (task.status === 'completed') return 'completed';

  // Auto-close conditions for active tasks
  if (task.filled_tasks >= task.total_tasks) return 'closed';
  if (task.visible_till && new Date(task.visible_till) < new Date()) return 'closed';
  if (task.end_date && new Date(task.end_date) < new Date()) return 'closed';

  return 'active';
}

export function isTaskAcceptingSubmissions(task: Task): boolean {
  return getEffectiveTaskStatus(task) === 'active';
}
