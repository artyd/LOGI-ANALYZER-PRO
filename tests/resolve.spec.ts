import { describe, it, expect } from 'vitest';
import { resolveLine } from '../lib/engines/resolve';
import { calculatePayments } from '../lib/engines/payment';
import { CalcRequest } from '../lib/types/contract';

function pipeline(raw: Parameters<typeof resolveLine>[0], incoterm = 'CIF') {
  const resolved = resolveLine(raw);
  const req = CalcRequest.parse({
    shipment: { incoterm, currency: 'USD' },
    lines: [resolved.calcInput],
  });
  return { resolved, result: calculatePayments(req).lines[0] };
}

describe('resolveLine → calculatePayments (детермінований пайплайн)', () => {
  it('код зі словника + груба ставка гл.29 (0%), позначено estimated', () => {
    const { resolved, result } = pipeline({ name: 'Амоксицилін тригідрат', qtyKg: 100, unitPrice: 10 });
    expect(resolved.code.value).toBe('2941100000');
    expect(resolved.code.source).toBe('kb_coarse');
    // Реальна MFN-ставка UA (WITS) для 294110 = 0% (uniform) → авторитетно (db), не оцінка.
    expect(result.dutyRatePercent!.value).toBe(0);
    expect(result.dutyRatePercent!.source).toBe('db');
    expect(result.dutyRatePercent!.estimated).toBe(false);
    expect(result.duty!.value).toBe(0);
    expect(result.vat!.value).toBe(200); // ПДВ 20% від 1000
  });

  it('явний код з таблиці + реальна MFN-ставка (WITS) для 3913', () => {
    const { resolved, result } = pipeline({
      name: 'Гіалуронова кислота',
      uctzedCode: '3913 90 00 90',
      qtyKg: 50,
      unitPrice: 100,
    });
    expect(resolved.code.value).toBe('3913900090');
    expect(resolved.code.source).toBe('user');
    // WITS HS-6 391390 = 2.55% (середнє по діапазону) → мито 5000*2.55%.
    expect(result.dutyRatePercent!.value).toBe(2.55);
    expect(result.duty!.value).toBeCloseTo(127.5, 1);
  });

  it('прекурсор дає попередження', () => {
    const { resolved } = pipeline({ name: 'Ephedrine HCl', qtyKg: 10, unitPrice: 50 });
    expect(resolved.precursor?.table).toBe(1);
    expect(resolved.warnings.some((w) => w.includes('Прекурсор'))).toBe(true);
  });

  it('невідома назва без коду → мито не рахується, needsReview', () => {
    const { resolved, result } = pipeline({ name: 'Загадковий товар XYZ', qtyKg: 10, unitPrice: 10 });
    expect(resolved.code.value).toBeNull();
    expect(result.duty).toBeNull();
    expect(result.needsReview).toBe(true);
  });
});
