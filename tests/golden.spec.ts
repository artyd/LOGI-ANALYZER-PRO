import { describe, it, expect } from 'vitest';
import casesRaw from './golden/cases.json';
import { runGolden, formatReport, type GoldenCase } from './golden/harness';

/**
 * Регресійний вартовий точності. Друкує звіт по полях і вимагає, щоб
 * КОЖЕН golden-кейс проходив повністю. Розширюй `cases.json` реальними
 * рядками маніфестів зі звіреною людиною відповіддю — і будь-яке
 * майбутнє «покращення» точності вимірюється в числах, а не на віру.
 */
describe('golden accuracy', () => {
  const cases = casesRaw as GoldenCase[];

  it('звіт точності по полях', () => {
    const rep = runGolden(cases);
    // Друкуємо завжди — видно поточний стан навіть коли все зелене.
    console.log(formatReport(rep));
    expect(rep.total).toBeGreaterThan(0);
  });

  it.each((casesRaw as GoldenCase[]).map((c) => [c.id, c] as const))(
    'кейс %s відповідає звіреній істині',
    (_id, gc) => {
      const rep = runGolden([gc]);
      if (rep.passedCases !== 1) console.log(formatReport(rep));
      expect(rep.passedCases).toBe(1);
    },
  );
});
