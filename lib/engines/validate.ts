/**
 * Структурна валідація коду УКТЗЕД (без зовнішнього тарифу — на основі
 * стабільної структури HS/УКТЗЕД). Ловить некоректні коди, особливо від AI.
 */

// Глави, яких не існує в HS (зарезервовані/порожні).
const INVALID_CHAPTERS = new Set(['00', '77', '98', '99']);

export interface CodeValidation {
  digits: string;
  structureValid: boolean;
  chapter: string;
  reason: string | null;
}

export function validateUktzedStructure(code: string | null | undefined): CodeValidation {
  const digits = String(code ?? '').replace(/\D/g, '');
  const chapter = digits.slice(0, 2);
  if (digits.length === 0) {
    return { digits, structureValid: false, chapter, reason: 'Код відсутній.' };
  }
  if (digits.length !== 10) {
    return {
      digits,
      structureValid: false,
      chapter,
      reason: `Код має бути 10-значним (отримано ${digits.length}).`,
    };
  }
  const ch = parseInt(chapter, 10);
  if (INVALID_CHAPTERS.has(chapter) || ch < 1 || ch > 97) {
    return { digits, structureValid: false, chapter, reason: `Неіснуюча глава УКТЗЕД: ${chapter}.` };
  }
  return { digits, structureValid: true, chapter, reason: null };
}

/**
 * Груба перевірка правдоподібності коду за класом речовини (тільки впевнені правила).
 * Повертає false лише коли клас чіткий, а глава явно не та (ловить грубі помилки).
 */
const CLASS_CHAPTERS: { rx: RegExp; headings: string[]; label: string }[] = [
  { rx: /антибіотик/i, headings: ['2941'], label: 'антибіотик' },
  { rx: /вітамін|vitamin/i, headings: ['2936', '2106', '2309'], label: 'вітамін' },
  { rx: /амінокислот/i, headings: ['2922', '2925', '2930', '2941', '2309'], label: 'амінокислота' },
  { rx: /фермент|enzyme/i, headings: ['3507'], label: 'фермент' },
  { rx: /желатин|gelatin/i, headings: ['3503'], label: 'желатин' },
];

export function codeClassPlausible(
  code: string | null | undefined,
  category?: string | null,
): { plausible: boolean; note: string | null } {
  const digits = String(code ?? '').replace(/\D/g, '');
  const cat = String(category ?? '');
  if (digits.length < 4 || !cat) return { plausible: true, note: null };
  for (const rule of CLASS_CHAPTERS) {
    if (rule.rx.test(cat)) {
      const ok = rule.headings.some((h) => digits.startsWith(h));
      if (!ok) {
        return {
          plausible: false,
          note: `Код ${digits.slice(0, 4)} не типовий для класу «${rule.label}» (очікується ${rule.headings.join('/')}). Перевірити класифікацію.`,
        };
      }
      return { plausible: true, note: null };
    }
  }
  return { plausible: true, note: null };
}
