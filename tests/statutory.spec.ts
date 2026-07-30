import { describe, it, expect } from 'vitest';
import { STATUTORY_TARIFF, STATUTORY_SIZE } from '../lib/engines/statutory';
import { buildTariffTable } from '../lib/tariff/tariff';
import { resolveLine } from '../lib/engines/resolve';

describe('вбудований статутний тариф', () => {
  it('наразі порожній (даних 2697-IX у відкритому bulk-джерелі немає — не вигадуємо)', () => {
    expect(STATUTORY_SIZE).toBe(0);
    expect(STATUTORY_TARIFF.get('2941100000')).toBeNull();
  });
});

describe('resolveLine — пріоритет джерел ставки', () => {
  // Фікстура «статутного» тарифу: код амоксициліну з НЕ-нульовою ставкою,
  // щоб довести, що статутний тариф перекриває WITS MFN (для 294110 = 0%).
  const statutory = buildTariffTable([
    { code: '2941100000', dutyPercent: 4.2, vatRegime: 'medicine_7' },
  ]);

  it('статутний тариф (10-знак) перекриває реальну MFN WITS (HS-6)', () => {
    // Без статутного: 294110 → 0% (WITS, db). Зі статутним → 4.2% (db, авторитетно).
    const r = resolveLine({ name: 'Амоксицилін тригідрат', qtyKg: 100, unitPrice: 10 }, null, statutory);
    expect(r.code.value).toBe('2941100000');
    expect(r.calcInput.dutyRatePercent).toBe(4.2);
    expect(r.calcInput.dutyRateSource).toBe('db');
    expect(r.calcInput.vatRegime).toBe('medicine_7'); // ПДВ 7% з тарифу
    expect(r.code.confidence).toBe('high');
  });

  it('тариф користувача перекриває статутний', () => {
    const userTariff = buildTariffTable([{ code: '2941100000', dutyPercent: 1.5, vatRegime: 'standard_20' }]);
    const r = resolveLine({ name: 'Амоксицилін тригідрат', qtyKg: 100, unitPrice: 10 }, userTariff, statutory);
    expect(r.calcInput.dutyRatePercent).toBe(1.5); // користувач > статутний
    expect(r.calcInput.vatRegime).toBe('standard_20');
  });

  it('без статутного й без користувацького — падає на реальну MFN WITS', () => {
    const r = resolveLine({ name: 'Амоксицилін тригідрат', qtyKg: 100, unitPrice: 10 }, null, null);
    expect(r.calcInput.dutyRatePercent).toBe(0); // WITS 294110
    expect(r.calcInput.dutyRateSource).toBe('db');
  });
});
