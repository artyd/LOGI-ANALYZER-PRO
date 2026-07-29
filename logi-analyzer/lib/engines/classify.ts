import {
  PRODUCT_ORIGIN_KB,
  MANUFACTURER_KB,
  ADR_SUBSTANCE_DB,
  UKTZED_CODE_DB,
  HS_DUTY_TABLE,
  PRECURSOR_WATCH,
  type ProductOriginEntry,
  type ManufacturerEntry,
  type AdrEntry,
} from '../data';
import type { ValueSource } from '../types/contract';

/**
 * Движок 2 (in-memory версія) — класифікація/пошук за мігрованими довідниками.
 * Замінює наївний substring-пошук нормалізованим зіставленням; коли з'явиться
 * Neon — цей шар підмінюється на pg_trgm/embedding, контракт лишається.
 */

export function normalize(s: string | null | undefined): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[’'"`.,;:()\[\]/\\]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Пошук найкращого запису за keys[]: найдовший ключ, що міститься в назві. */
function bestByKeys<T extends { keys: string[] }>(
  entries: T[],
  haystack: string,
): { entry: T; key: string } | null {
  const h = normalize(haystack);
  let best: { entry: T; key: string } | null = null;
  let bestLen = 0;
  for (const entry of entries) {
    for (const key of entry.keys) {
      const k = normalize(key);
      if (k.length >= 3 && h.includes(k) && k.length > bestLen) {
        best = { entry, key };
        bestLen = k.length;
      }
    }
  }
  return best;
}

// ── Пошук коду УКТЗЕД за назвою ───────────────────────────────────
export interface CodeMatch {
  code: string;
  name: string;
  matchedBy: 'alias' | null;
}
export function lookupUktzedCode(name: string): CodeMatch | null {
  const m = bestByKeys(UKTZED_CODE_DB, name);
  if (!m) return null;
  return { code: m.entry.code, name: m.entry.name, matchedBy: 'alias' };
}

// ── Ставка мита за кодом (порт lookupDutyRate @9255) ──────────────
export interface DutyMatch {
  ratePercent: number;
  source: ValueSource; // 'kb_coarse'
  matchedKey: string;
}
export function lookupDutyRate(hsCode: string | null | undefined): DutyMatch | null {
  if (!hsCode) return null;
  const digits = String(hsCode).replace(/\D/g, '');
  if (!digits || digits.length < 4) return null;
  for (const len of [10, 8, 6, 4]) {
    const key = digits.slice(0, len);
    if (HS_DUTY_TABLE[key] !== undefined) {
      return { ratePercent: HS_DUTY_TABLE[key], source: 'kb_coarse', matchedKey: key };
    }
  }
  const chapter = digits.slice(0, 2);
  if (HS_DUTY_TABLE[chapter] !== undefined) {
    return { ratePercent: HS_DUTY_TABLE[chapter], source: 'kb_coarse', matchedKey: chapter };
  }
  return null;
}

// ── Походження товару ─────────────────────────────────────────────
export function lookupProductOrigin(name: string, category?: string): ProductOriginEntry | null {
  const hay = category ? `${name} ${category}` : name;
  return bestByKeys(PRODUCT_ORIGIN_KB, hay)?.entry ?? null;
}

export function lookupManufacturer(text: string): ManufacturerEntry | null {
  return bestByKeys(MANUFACTURER_KB, text)?.entry ?? null;
}

export function lookupAdr(name: string): AdrEntry | null {
  return bestByKeys(ADR_SUBSTANCE_DB, name)?.entry ?? null;
}

// ── Прекурсори / контрольовані речовини (порт @9270) ──────────────
export interface PrecursorHit {
  table: number;
  note: string;
  matchedByCode: boolean;
}
export function checkPrecursor(name: string, hsCode?: string | null): PrecursorHit | null {
  const digits = String(hsCode ?? '').replace(/\D/g, '');
  for (const p of PRECURSOR_WATCH) {
    const byName = p.name.test(name);
    const byCode = digits ? p.code.test(digits) : false;
    if (byName || byCode) {
      return { table: p.table, note: p.note, matchedByCode: byCode && !byName };
    }
  }
  return null;
}
