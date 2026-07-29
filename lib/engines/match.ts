/**
 * Точний матчер за псевдонімами (заміна наївного substring-пошуку).
 * Нормалізує назву, працює на рівні токенів і повертає впевненість.
 * Використовується для визначення коду УКТЗЕД, походження, ADR, виробника.
 */

// «Шумові» слова/токени, що не несуть ідентичності речовини.
const NOISE = new Set([
  'порошок', 'powder', 'субстанція', 'субстанция', 'substance', 'grade', 'gmp', 'usp', 'bp', 'ep', 'ph',
  'eur', 'feed', 'food', 'кормовий', 'кормова', 'кормовой', 'харчовий', 'технічний', 'мін', 'макс',
  'кристал', 'crystal', 'anhydrous', 'безводний', 'mono', 'моно', 'pure', 'чистий', 'фарм', 'pharma',
  'кг', 'kg', 'мішок', 'bag', 'коробка', 'l', 'мл', 'ml', 'г', 'g',
  // солеві/гідратні/формні слова — не змінюють ідентичність речовини для розпізнавання
  'hydrochloride', 'hcl', 'гідрохлорид', 'гидрохлорид', 'гхл', 'sulfate', 'sulphate', 'сульфат',
  'phosphate', 'фосфат', 'acetate', 'ацетат', 'citrate', 'цитрат', 'sodium', 'натрію', 'натрия',
  'calcium', 'кальцію', 'кальция', 'potassium', 'калію', 'magnesium', 'магнію', 'zinc', 'цинку',
  'monohydrate', 'моногідрат', 'dihydrate', 'дигідрат', 'trihydrate', 'тригідрат', 'hydrate', 'гідрат',
  'salt', 'сіль', 'solution', 'розчин',
]);

export function normalizeName(s: string | null | undefined): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[ʼ'`’ʹ]/g, '')
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(s: string | null | undefined): string[] {
  return normalizeName(s)
    .split(' ')
    .filter((t) => t.length > 0);
}

/** Значущі токени (без шуму й без коротких/числових). */
export function contentTokens(s: string | null | undefined): string[] {
  return tokenize(s).filter((t) => t.length >= 3 && !NOISE.has(t) && !/^\d+$/.test(t));
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export type Confidence = 'high' | 'medium' | 'low';

export interface AliasMatch<T> {
  entry: T;
  key: string;
  score: number;
  confidence: Confidence;
}

/**
 * Знаходить найкращий запис за keys[]. Скоринг (за спаданням надійності):
 *  1000+ — точний збіг усієї назви з ключем;
 *   200+ — ключ як ціле слово/фраза (на межах токенів);
 *   100+ — усі значущі токени ключа присутні в назві (порядок неважливий);
 *    40+ — м'який підрядок (запасний).
 */
export function matchByAliases<T extends { keys: string[] }>(
  entries: T[],
  name: string,
): AliasMatch<T> | null {
  const hay = normalizeName(name);
  if (!hay) return null;
  const hayTokens = tokenize(name);

  // Стем-сумісність: 'лізин' ~ 'лізину' (відмінки), 'sulfate' ~ 'sulfates'.
  const tokenMatches = (kt: string): boolean =>
    hayTokens.some(
      (ht) => ht === kt || (kt.length >= 4 && ht.length >= 4 && (ht.startsWith(kt) || kt.startsWith(ht))),
    );

  let best: AliasMatch<T> | null = null;
  for (const entry of entries) {
    for (const rawKey of entry.keys) {
      const key = normalizeName(rawKey);
      if (key.length < 3) continue;
      const kTokens = tokenize(rawKey).filter((t) => t.length >= 2);
      let score = 0;

      if (hay === key) {
        score = 1000 + key.length;
      } else if (new RegExp(`(^| )${escapeRe(key)}( |$)`).test(hay)) {
        score = 200 + key.length * 3;
      } else if (kTokens.length > 0 && kTokens.every(tokenMatches)) {
        // усі значущі токени ключа присутні (з урахуванням відмінків/форм)
        score = 100 + kTokens.reduce((a, t) => a + t.length, 0) + (kTokens.length - 1) * 10;
      } else if (key.length >= 4 && hay.includes(key)) {
        score = 40 + key.length;
      }

      if (score > (best?.score ?? 0)) {
        best = { entry, key: rawKey, score, confidence: 'low' };
      }
    }
  }

  if (!best) return null;
  best.confidence = best.score >= 200 ? 'high' : best.score >= 100 ? 'medium' : 'low';
  return best;
}
