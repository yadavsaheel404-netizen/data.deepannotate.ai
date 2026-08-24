import { useCallback, useEffect, useRef, useState } from 'react';
import { createTask, updateTask } from '@/services/projectService';
import type { TaskInsert } from '@/types/project';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const LS_KEY = 'createTaskDraft:v1';

export interface DraftBackup {
  draftId: string | null;
  values: Record<string, any>;
  dosItems: string[];
  dontsItems: string[];
  sampleMediaUrls: string[];
  savedAt: number;
}

export function readLocalDraft(): DraftBackup | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as DraftBackup) : null;
  } catch {
    return null;
  }
}

export function clearLocalDraft() {
  try { localStorage.removeItem(LS_KEY); } catch { /* noop */ }
}

interface UseAutosaveOpts {
  userId: string | undefined;
  enabled: boolean;
  /** Build the partial payload to persist. Return null to skip save. */
  buildPayload: () => Partial<TaskInsert> | null;
  /** Build the local backup snapshot. */
  buildBackup: () => Omit<DraftBackup, 'draftId' | 'savedAt'>;
  /** Existing draft id (e.g. when resuming). */
  initialDraftId?: string | null;
  debounceMs?: number;
}

export function useTaskDraftAutosave({
  userId,
  enabled,
  buildPayload,
  buildBackup,
  initialDraftId = null,
  debounceMs = 2000,
}: UseAutosaveOpts) {
  const [draftId, setDraftId] = useState<string | null>(initialDraftId);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  const draftIdRef = useRef<string | null>(initialDraftId);
  useEffect(() => { draftIdRef.current = draftId; }, [draftId]);

  const persistLocal = useCallback((id: string | null) => {
    try {
      const backup = buildBackup();
      const payload: DraftBackup = { ...backup, draftId: id, savedAt: Date.now() };
      localStorage.setItem(LS_KEY, JSON.stringify(payload));
    } catch { /* noop */ }
  }, [buildBackup]);

  const flush = useCallback(async () => {
    if (!enabled || !userId || inFlight.current) return;
    const payload = buildPayload();
    if (!payload) return;

    inFlight.current = true;
    setStatus('saving');
    try {
      let id = draftIdRef.current;
      if (!id) {
        const created = await createTask({
          ...(payload as TaskInsert),
          status: 'draft',
          created_by: userId,
        } as TaskInsert);
        id = created.id;
        setDraftId(id);
      } else {
        await updateTask(id, { ...payload, status: 'draft' });
      }
      persistLocal(id);
      setStatus('saved');
      setLastSavedAt(Date.now());
    } catch (e) {
      console.error('[autosave] failed', e);
      setStatus('error');
    } finally {
      inFlight.current = false;
    }
  }, [enabled, userId, buildPayload, persistLocal]);

  const schedule = useCallback(() => {
    if (!enabled) return;
    // Always update local backup immediately
    persistLocal(draftIdRef.current);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void flush(); }, debounceMs);
  }, [enabled, flush, debounceMs, persistLocal]);

  const flushNow = useCallback(async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    await flush();
  }, [flush]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return { draftId, setDraftId, status, lastSavedAt, schedule, flushNow };
}
