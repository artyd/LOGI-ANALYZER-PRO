import type { AnalysisResult } from './pipeline/deterministic';
import type { AiResponse } from './ai/schema';

const KEY = 'lap_archive_v3';

export interface ArchiveEntry {
  ts: number;
  when: string;
  name: string;
  count: number;
  total: number;
  currency: string;
  result: AnalysisResult;
  ai: AiResponse | null;
}

export function loadArchive(): ArchiveEntry[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
}

export function saveToArchive(e: ArchiveEntry): ArchiveEntry[] {
  const next = [e, ...loadArchive()].slice(0, 50);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* сховище повне — ігноруємо */
  }
  return next;
}

export function clearArchive(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
