/**
 * Formats a UUID (the `id` column on the `tasks` table) into a human-friendly
 * submission/task identifier: TASK-XXXXXX (first 6 chars, uppercased).
 *
 * NOTE: We deliberately do NOT introduce a new submission_id field.
 * The existing `tasks.id` IS the canonical submission/task identifier and
 * flows through review → payments → payouts.
 */
export function formatTaskId(id: string | null | undefined): string {
  if (!id) return '—';
  return `TASK-${id.replace(/-/g, '').slice(0, 6).toUpperCase()}`;
}

/** Returns true if `query` matches the task id (full uuid OR formatted short id). */
export function matchesTaskId(id: string, query: string): boolean {
  if (!id || !query) return false;
  const q = query.trim().toLowerCase().replace(/^task-/, '');
  if (!q) return false;
  const normalized = id.replace(/-/g, '').toLowerCase();
  return normalized.startsWith(q) || formatTaskId(id).toLowerCase().includes(query.trim().toLowerCase());
}

/**
 * Formats a withdrawal request id into a human-friendly identifier: WD-XXXXXX.
 * Reuses the existing `withdraw_requests.id` (UUID) — no new ID column.
 * If a numeric id is ever passed, it is zero-padded to 6 digits (WD-000123).
 */
export function formatWithdrawalId(id: string | number | null | undefined): string {
  if (id === null || id === undefined || id === '') return '—';
  if (typeof id === 'number' || /^\d+$/.test(String(id))) {
    return `WD-${String(id).padStart(6, '0')}`;
  }
  return `WD-${String(id).replace(/-/g, '').slice(0, 6).toUpperCase()}`;
}

/** Returns true if `query` matches the withdrawal id (full uuid OR formatted short id). */
export function matchesWithdrawalId(id: string, query: string): boolean {
  if (!id || !query) return false;
  const q = query.trim().toLowerCase().replace(/^wd-/, '');
  if (!q) return false;
  const normalized = id.replace(/-/g, '').toLowerCase();
  return normalized.startsWith(q) || formatWithdrawalId(id).toLowerCase().includes(query.trim().toLowerCase());
}
