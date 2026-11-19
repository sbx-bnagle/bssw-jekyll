// Local autosave (localStorage). Every draft lives here; GitHub is the
// shared copy once the contributor saves.
import type { Draft } from './model';

const INDEX = 'bssw-editor:index';
const KEY = (id: string) => `bssw-editor:draft:${id}`;
const LAST = 'bssw-editor:last';

export interface DraftSummary { id: string; title: string; updatedAt: number; branch?: string }

export function listLocal(): DraftSummary[] {
  try { return (JSON.parse(localStorage.getItem(INDEX) || '[]') as DraftSummary[]).sort((a, b) => b.updatedAt - a.updatedAt); }
  catch { return []; }
}

export function loadLocal(id: string): Draft | undefined {
  try {
    const d = JSON.parse(localStorage.getItem(KEY(id)) || 'null') as Draft | null;
    return d ? { ...d, uploads: d.uploads ?? {}, committed: d.committed ?? [], newAuthors: d.newAuthors ?? {} } : undefined;
  } catch { return undefined; }
}

/** Returns false when storage is full (uploads are dropped first). */
export function saveLocal(draft: Draft): boolean {
  const summary: DraftSummary = { id: draft.id, title: draft.meta.title || 'Untitled draft', updatedAt: draft.updatedAt, branch: draft.remote?.branch };
  const index = listLocal().filter((d) => d.id !== draft.id);
  try {
    localStorage.setItem(KEY(draft.id), JSON.stringify(draft));
  } catch {
    try { localStorage.setItem(KEY(draft.id), JSON.stringify({ ...draft, uploads: {} })); }
    catch { return false; }
  }
  localStorage.setItem(INDEX, JSON.stringify([summary, ...index]));
  localStorage.setItem(LAST, draft.id);
  return true;
}

export function deleteLocal(id: string) {
  localStorage.removeItem(KEY(id));
  localStorage.setItem(INDEX, JSON.stringify(listLocal().filter((d) => d.id !== id)));
}

export function lastOpenId(): string | null { return localStorage.getItem(LAST); }
