import {
  lookupUktzedCode,
  lookupDutyRate,
  lookupProductOrigin,
  lookupAdr,
  checkPrecursor,
  type PrecursorHit,
} from './classify';
import type { CalcLineInput, ValueSource, VatRegime } from '../types/contract';
import type { ProductOriginEntry, AdrEntry } from '../data';

/**
 * Детермінований шар «грунтування» позиції ПЕРЕД AI/розрахунком.
 * Порядок авторитету: код з таблиці > код зі словника УКТЗЕД > код від AI.
 * Мито береться зі ставки за кодом (kb_coarse у Фазі 1), НЕ вигадується.
 */
export interface RawLine {
  name: string;
  /** Код з таблиці (найточніше), якщо є. */
  uctzedCode?: string | null;
  qtyKg: number;
  unitPrice: number;
  /** Код, запропонований AI (перевіряється тут). */
  aiSuggestedCode?: string | null;
  vatRegime?: VatRegime;
}

export interface ResolvedLine {
  calcInput: CalcLineInput;
  code: { value: string | null; source: ValueSource; matchedBy: string | null };
  origin: ProductOriginEntry | null;
  adr: AdrEntry | null;
  precursor: PrecursorHit | null;
  warnings: string[];
}

const digitsOnly = (s: string | null | undefined): string => String(s ?? '').replace(/\D/g, '');

export function resolveLine(raw: RawLine): ResolvedLine {
  const warnings: string[] = [];

  // ── Код УКТЗЕД ──
  let code: string | null = null;
  let codeSource: ValueSource = 'unknown';
  let matchedBy: string | null = null;

  if (raw.uctzedCode && digitsOnly(raw.uctzedCode).length >= 4) {
    code = digitsOnly(raw.uctzedCode);
    codeSource = 'user';
    matchedBy = 'table';
  } else {
    const dict = lookupUktzedCode(raw.name);
    if (dict) {
      code = digitsOnly(dict.code);
      codeSource = 'kb_coarse';
      matchedBy = 'uktzed_dict';
    } else if (raw.aiSuggestedCode && digitsOnly(raw.aiSuggestedCode).length >= 4) {
      code = digitsOnly(raw.aiSuggestedCode);
      codeSource = 'ai';
      matchedBy = 'ai_suggested';
      warnings.push('Код УКТЗЕД запропоновано AI — перевірити за офіційним тарифом.');
    } else {
      warnings.push('Код УКТЗЕД не визначено — мито не рахується.');
    }
  }

  // ── Ставка мита за кодом ──
  let dutyRatePercent: number | null = null;
  let dutyRateSource: ValueSource = 'unknown';
  if (code) {
    const duty = lookupDutyRate(code);
    if (duty) {
      dutyRatePercent = duty.ratePercent;
      dutyRateSource = duty.source; // 'kb_coarse'
    } else {
      warnings.push(`Ставку мита для коду ${code} не знайдено в таблиці — уточнити.`);
    }
  }

  // ── Довідкові сигнали ──
  const origin = lookupProductOrigin(raw.name);
  const adr = lookupAdr(raw.name);
  const precursor = checkPrecursor(raw.name, code);
  if (precursor) {
    warnings.push(
      `Прекурсор/контрольована речовина (таблиця ${precursor.table}): ${precursor.note}`,
    );
  }

  const calcInput: CalcLineInput = {
    name: raw.name,
    uctzedCode: code,
    qtyKg: raw.qtyKg,
    unitPrice: raw.unitPrice,
    dutyRatePercent,
    dutyRateSource,
    vatRegime: raw.vatRegime ?? 'standard_20',
    exciseAmountPerKg: null,
  };

  return { calcInput, code: { value: code, source: codeSource, matchedBy }, origin, adr, precursor, warnings };
}
