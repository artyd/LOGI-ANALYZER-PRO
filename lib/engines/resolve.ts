import {
  lookupUktzedCode,
  lookupDutyRate,
  lookupProductOriginMatch,
  lookupManufacturer,
  lookupAdr,
  checkPrecursor,
  type PrecursorHit,
} from './classify';
import type { Confidence } from './match';
import { lookupMfnRate } from './mfn';
import { validateUktzedStructure, codeClassPlausible, codeExistsInHs, hsHeadingDescription } from './validate';
import type { TariffTable } from '../tariff/tariff';
import type { CalcLineInput, ValueSource, VatRegime } from '../types/contract';
import type { ProductOriginEntry, AdrEntry } from '../data';

/**
 * Детермінований шар «грунтування» позиції ПЕРЕД AI/розрахунком.
 * Порядок авторитету: код з таблиці > код зі словника УКТЗЕД > код від AI.
 * Мито береться зі ставки за кодом (kb_coarse у Фазі 1), НЕ вигадується.
 */
export interface RawLine {
  name: string;
  uctzedCode?: string | null;
  qtyKg: number;
  unitPrice: number;
  aiSuggestedCode?: string | null;
  vatRegime?: VatRegime;
}

export interface ResolvedLine {
  calcInput: CalcLineInput;
  code: { value: string | null; source: ValueSource; matchedBy: string | null; confidence: Confidence | null };
  /** Проблема з кодом (структура/правдоподібність), якщо є. */
  codeIssue: string | null;
  /** Офіційний опис позиції HS (WCO), якщо код визначено. */
  hsDescription: string | null;
  origin: ProductOriginEntry | null;
  originConfidence: Confidence | null;
  /** Підказка типу походження, коли речовини немає в базі (з виробника). */
  originTypeHint: string | null;
  adr: AdrEntry | null;
  precursor: PrecursorHit | null;
  warnings: string[];
}

const digitsOnly = (s: string | null | undefined): string => String(s ?? '').replace(/\D/g, '');

export function resolveLine(raw: RawLine, tariff?: TariffTable | null): ResolvedLine {
  const warnings: string[] = [];

  // ── Довідкове визначення речовини (для походження + крос-лінку) ──
  const originMatch = lookupProductOriginMatch(raw.name);
  const origin = originMatch?.entry ?? null;
  let originConfidence = originMatch?.confidence ?? null;
  // Крос-сигнал: якщо речовини немає в базі, але відомий виробник — беремо тип виробництва.
  let originTypeHint: string | null = origin?.originType ?? null;
  if (!origin) {
    const manuf = lookupManufacturer(raw.name);
    if (manuf?.originType) {
      originTypeHint = manuf.originType;
      originConfidence = 'medium';
      warnings.push(`Походження визначено за виробником: ${manuf.originType}.`);
    }
  }

  // ── Код УКТЗЕД ──
  let code: string | null = null;
  let codeSource: ValueSource = 'unknown';
  let matchedBy: string | null = null;
  let codeConfidence: Confidence | null = null;

  if (raw.uctzedCode && digitsOnly(raw.uctzedCode).length >= 4) {
    code = digitsOnly(raw.uctzedCode);
    codeSource = 'user';
    matchedBy = 'table';
    codeConfidence = 'high';
  } else {
    const dict = lookupUktzedCode(raw.name);
    if (dict) {
      code = digitsOnly(dict.code);
      codeSource = 'kb_coarse';
      matchedBy = 'uktzed_dict';
      codeConfidence = dict.confidence;
    } else if (
      raw.aiSuggestedCode &&
      validateUktzedStructure(raw.aiSuggestedCode).structureValid &&
      codeExistsInHs(raw.aiSuggestedCode)
    ) {
      code = digitsOnly(raw.aiSuggestedCode);
      codeSource = 'ai';
      matchedBy = 'ai_suggested';
      codeConfidence = 'low';
      warnings.push('Код УКТЗЕД запропоновано AI — перевірити за офіційним тарифом.');
    } else if (raw.aiSuggestedCode) {
      const why = !validateUktzedStructure(raw.aiSuggestedCode).structureValid
        ? validateUktzedStructure(raw.aiSuggestedCode).reason
        : 'підпозиція відсутня в номенклатурі HS';
      warnings.push(`Код від AI відхилено (${why}).`);
    } else {
      warnings.push('Код УКТЗЕД не визначено — мито не рахується.');
    }
  }

  // ── Валідація коду (структура + правдоподібність за класом) ──
  let codeIssue: string | null = null;
  if (code) {
    const struct = validateUktzedStructure(code);
    if (!struct.structureValid) {
      codeIssue = struct.reason;
      warnings.push(`Код ${code}: ${struct.reason}`);
    } else {
      const plaus = codeClassPlausible(code, origin?.category);
      if (!plaus.plausible) {
        codeIssue = plaus.note;
        warnings.push(plaus.note!);
      }
    }
  }

  // ── Ставка мита за кодом (пріоритет: завантажений тариф > груба таблиця) ──
  let dutyRatePercent: number | null = null;
  let dutyRateSource: ValueSource = 'unknown';
  let vatFromTariff: VatRegime | null = null;
  if (code) {
    const te = tariff?.get(code);
    if (te) {
      codeConfidence = 'high'; // код підтверджено офіційним завантаженим тарифом
      vatFromTariff = te.vatRegime ?? null;
      if (te.dutyPercent != null) {
        dutyRatePercent = te.dutyPercent;
        dutyRateSource = 'db'; // авторитетно, не оцінка
      }
    }
    if (dutyRatePercent == null) {
      const mfn = lookupMfnRate(code);
      if (mfn) {
        // Реальна MFN-ставка UA (WITS/UNCTAD) на рівні HS-6.
        dutyRatePercent = mfn.ratePercent;
        dutyRateSource = mfn.ranged ? 'kb_coarse' : 'db';
        if (mfn.ranged) {
          warnings.push(`Ставка мита ${mfn.ratePercent}% — середня по HS-6 ${mfn.hs6} (є діапазон); уточнити на 10-значному коді.`);
        }
      } else {
        const duty = lookupDutyRate(code);
        if (duty) {
          dutyRatePercent = duty.ratePercent;
          dutyRateSource = duty.source;
        } else {
          warnings.push(`Ставку мита для коду ${code} не знайдено — уточнити.`);
        }
      }
    }
  }

  const adr = lookupAdr(raw.name);
  const precursor = checkPrecursor(raw.name, code);
  if (precursor) {
    warnings.push(`Прекурсор/контрольована речовина (таблиця ${precursor.table}): ${precursor.note}`);
  }

  const calcInput: CalcLineInput = {
    name: raw.name,
    uctzedCode: code,
    qtyKg: raw.qtyKg,
    unitPrice: raw.unitPrice,
    dutyRatePercent,
    dutyRateSource,
    vatRegime: vatFromTariff ?? raw.vatRegime ?? 'standard_20',
    exciseAmountPerKg: null,
  };

  return {
    calcInput,
    code: { value: code, source: codeSource, matchedBy, confidence: codeConfidence },
    codeIssue,
    hsDescription: hsHeadingDescription(code),
    origin,
    originConfidence,
    originTypeHint,
    adr,
    precursor,
    warnings,
  };
}
