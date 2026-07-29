import uaMfnRaw from '../data/ua_mfn.json';
import uaMfnRangedRaw from '../data/ua_mfn_ranged.json';

/**
 * Реальні MFN-ставки ввізного мита України на рівні HS-6.
 * Джерело: WITS / UNCTAD TRAINS (World Bank), reporter=804 (Україна), TARIFFTYPE=MFN,
 * OBS_VALUE = SimpleAverage. Значно точніше за грубу главову таблицю.
 * Обмеження: рівень HS-6 (перші 6 знаків УКТЗЕД); для позицій з діапазоном (MIN≠MAX)
 * значення — середнє, тому позначається як приблизне (уточнити на 10-значному коді).
 */
const MFN = uaMfnRaw as Record<string, number>;
const RANGED = new Set(uaMfnRangedRaw as string[]);

export interface MfnRate {
  ratePercent: number;
  hs6: string;
  ranged: boolean; // true → середнє по діапазону (приблизне)
}

export function lookupMfnRate(code: string | null | undefined): MfnRate | null {
  const hs6 = String(code ?? '').replace(/\D/g, '').slice(0, 6);
  if (hs6.length !== 6 || MFN[hs6] === undefined) return null;
  return { ratePercent: MFN[hs6], hs6, ranged: RANGED.has(hs6) };
}
