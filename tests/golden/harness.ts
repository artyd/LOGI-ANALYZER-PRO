import { resolveLine, type RawLine } from '../../lib/engines/resolve';
import type { TariffTable } from '../../lib/tariff/tariff';

/**
 * Harness виміру точності класифікації на golden-наборі.
 *
 * ПРИНЦИП: `expect`-значення — це ІСТИНА, звірена людиною (реальні рядки
 * маніфестів + правильна відповідь митного брокера), а НЕ вивід движка.
 * Тому набір розширюється вручну, а не автогенерацією з resolveLine.
 *
 * Кожне поле в `expect` необов'язкове — оцінюються лише присутні поля.
 * Так один кейс може перевіряти лише код, інший — лише прекурсор тощо.
 */

export interface GoldenExpect {
  /** Повний код УКТЗЕД (лише цифри). */
  code?: string;
  /** Перші 6 знаків (рівень HS/WCO) — м'якша перевірка, коли 10-й знак невідомий. */
  codeHs6?: string;
  /** Джерело коду: user | kb_coarse | ai | unknown. */
  codeSource?: string;
  /** Код має бути null (невідомий товар). */
  codeIsNull?: boolean;
  /** Ставка мита, %. */
  dutyRatePercent?: number;
  /** Джерело ставки: db (авторитетно) | kb_coarse (оцінка) | unknown. */
  dutyRateSource?: string;
  /** Ставка має бути null. */
  dutyRateIsNull?: boolean;
  /** Тип походження (origin.originType або originTypeHint). */
  originType?: string;
  /** Категорія товару з бази походження. */
  originCategory?: string;
  /** Номер UN за ADR. */
  adrUn?: string;
  /** Таблиця прекурсорів (1..4). */
  precursorTable?: number;
  /** Підрядки, які мають бути серед warnings. */
  warningIncludes?: string[];
}

export interface GoldenCase {
  id: string;
  note?: string;
  input: RawLine;
  expect: GoldenExpect;
}

/** Результат перевірки одного поля. */
interface FieldCheck {
  field: string;
  ok: boolean;
  expected: unknown;
  actual: unknown;
}

export interface CaseResult {
  id: string;
  checks: FieldCheck[];
  passed: boolean;
}

const digits = (s: string | null | undefined): string => String(s ?? '').replace(/\D/g, '');

/** Проганяє один golden-кейс і повертає перевірки по кожному заявленому полю. */
export function runCase(gc: GoldenCase, tariff?: TariffTable | null): CaseResult {
  const r = resolveLine(gc.input, tariff);
  const e = gc.expect;
  const checks: FieldCheck[] = [];
  const add = (field: string, ok: boolean, expected: unknown, actual: unknown) =>
    checks.push({ field, ok, expected, actual });

  if (e.code !== undefined) add('code', digits(r.code.value) === digits(e.code), e.code, r.code.value);
  if (e.codeHs6 !== undefined)
    add('codeHs6', digits(r.code.value).slice(0, 6) === digits(e.codeHs6), e.codeHs6, digits(r.code.value).slice(0, 6));
  if (e.codeSource !== undefined) add('codeSource', r.code.source === e.codeSource, e.codeSource, r.code.source);
  if (e.codeIsNull !== undefined) add('codeIsNull', (r.code.value === null) === e.codeIsNull, e.codeIsNull, r.code.value);

  const duty = r.calcInput.dutyRatePercent;
  if (e.dutyRatePercent !== undefined) add('dutyRatePercent', duty === e.dutyRatePercent, e.dutyRatePercent, duty);
  if (e.dutyRateSource !== undefined)
    add('dutyRateSource', r.calcInput.dutyRateSource === e.dutyRateSource, e.dutyRateSource, r.calcInput.dutyRateSource);
  if (e.dutyRateIsNull !== undefined) add('dutyRateIsNull', (duty === null) === e.dutyRateIsNull, e.dutyRateIsNull, duty);

  if (e.originType !== undefined) {
    const actual = r.origin?.originType ?? r.originTypeHint ?? null;
    add('originType', actual === e.originType, e.originType, actual);
  }
  if (e.originCategory !== undefined)
    add('originCategory', (r.origin?.category ?? null) === e.originCategory, e.originCategory, r.origin?.category ?? null);
  if (e.adrUn !== undefined) add('adrUn', (r.adr?.un ?? null) === e.adrUn, e.adrUn, r.adr?.un ?? null);
  if (e.precursorTable !== undefined)
    add('precursorTable', (r.precursor?.table ?? null) === e.precursorTable, e.precursorTable, r.precursor?.table ?? null);

  if (e.warningIncludes !== undefined) {
    for (const sub of e.warningIncludes) {
      const ok = r.warnings.some((w) => w.includes(sub));
      add(`warning~"${sub}"`, ok, sub, r.warnings);
    }
  }

  return { id: gc.id, checks, passed: checks.every((c) => c.ok) };
}

export interface AccuracyReport {
  total: number;
  passedCases: number;
  byField: Record<string, { correct: number; total: number }>;
  results: CaseResult[];
}

/** Проганяє весь набір і рахує точність по полях та по кейсах. */
export function runGolden(cases: GoldenCase[], tariff?: TariffTable | null): AccuracyReport {
  const results = cases.map((c) => runCase(c, tariff));
  const byField: Record<string, { correct: number; total: number }> = {};
  for (const res of results) {
    for (const chk of res.checks) {
      const bucket = chk.field.replace(/~".*"$/, ''); // групуємо всі warning~"..." разом
      (byField[bucket] ??= { correct: 0, total: 0 }).total++;
      if (chk.ok) byField[bucket].correct++;
    }
  }
  return {
    total: results.length,
    passedCases: results.filter((r) => r.passed).length,
    byField,
    results,
  };
}

/** Друкований звіт точності (для консолі vitest). */
export function formatReport(rep: AccuracyReport): string {
  const lines: string[] = [];
  lines.push(`\n══ GOLDEN ACCURACY ══  кейсів: ${rep.passedCases}/${rep.total} повністю вірні`);
  const fields = Object.keys(rep.byField).sort();
  for (const f of fields) {
    const { correct, total } = rep.byField[f];
    const pct = total ? Math.round((correct / total) * 100) : 0;
    const bar = correct === total ? '✓' : '✗';
    lines.push(`  ${bar} ${f.padEnd(18)} ${correct}/${total}  (${pct}%)`);
  }
  const failing = rep.results.filter((r) => !r.passed);
  if (failing.length) {
    lines.push(`\n  ПРОВАЛИ:`);
    for (const r of failing) {
      for (const c of r.checks.filter((c) => !c.ok)) {
        lines.push(`    [${r.id}] ${c.field}: очікувано ${JSON.stringify(c.expected)}, отримано ${JSON.stringify(c.actual)}`);
      }
    }
  }
  return lines.join('\n');
}
