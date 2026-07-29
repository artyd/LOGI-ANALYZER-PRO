import { describe, it, expect } from 'vitest';
import { parseTariffRows, buildTariffTable } from '../lib/tariff/tariff';
import { resolveLine } from '../lib/engines/resolve';

const rows = [
  ['Митний тариф України'],
  ['Код УКТЗЕД', 'Опис', 'Ставка ввізного мита, %', 'ПДВ, %'],
  ['2922 41 00 00', 'Лізин та його ефіри; солі', '2', '20'],
  ['3004 90 00 00', 'Ліки, розфасовані', 'безмитно', '7'],
  ['3913 90 00 90', 'Природні полімери', '6.5', '20'],
];

describe('parseTariffRows', () => {
  it('парсить код/мито/ПДВ, автовизначення колонок', () => {
    const t = parseTariffRows(rows);
    expect(t.length).toBe(3);
    const lys = t.find((e) => e.code === '2922410000');
    expect(lys?.dutyPercent).toBe(2);
    expect(lys?.vatRegime).toBe('standard_20');
    const med = t.find((e) => e.code === '3004900000');
    expect(med?.dutyPercent).toBe(0); // безмитно
    expect(med?.vatRegime).toBe('medicine_7'); // 7%
  });
});

describe('resolveLine з завантаженим тарифом', () => {
  const tariff = buildTariffTable(parseTariffRows(rows));
  it('ставка мита з тарифу — авторитетна (source db, не оцінка)', () => {
    const r = resolveLine({ name: 'L-Лізин сульфат', qtyKg: 100, unitPrice: 2, uctzedCode: '2922410000' }, tariff);
    expect(r.calcInput.dutyRatePercent).toBe(2);
    expect(r.calcInput.dutyRateSource).toBe('db');
    expect(r.code.confidence).toBe('high');
    expect(r.calcInput.vatRegime).toBe('standard_20');
  });
  it('фарма з тарифу отримує 7% ПДВ автоматично', () => {
    const r = resolveLine({ name: 'Ліки', qtyKg: 10, unitPrice: 5, uctzedCode: '3004900000' }, tariff);
    expect(r.calcInput.vatRegime).toBe('medicine_7');
    expect(r.calcInput.dutyRatePercent).toBe(0);
  });
  it('без тарифу — груба таблиця (kb_coarse)', () => {
    const r = resolveLine({ name: 'X', qtyKg: 1, unitPrice: 1, uctzedCode: '3913900090' });
    expect(r.calcInput.dutyRateSource).toBe('kb_coarse');
  });
});
