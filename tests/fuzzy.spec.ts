import { describe, it, expect } from 'vitest';
import { editDistanceWithin, fuzzyNearestByAliases } from '../lib/engines/match';
import { resolveLine } from '../lib/engines/resolve';

describe('editDistanceWithin (обмежена)', () => {
  it('true в межах бюджету, false поза ним', () => {
    expect(editDistanceWithin('methionine', 'methionne', 1)).toBe(true); // пропущена літера
    expect(editDistanceWithin('methionine', 'methionine', 0)).toBe(true);
    expect(editDistanceWithin('lysine', 'lisine', 1)).toBe(true); // заміна y→i
    expect(editDistanceWithin('sulfate', 'sulfite', 1)).toBe(true); // 1 заміна — АЛЕ інша речовина
    expect(editDistanceWithin('lysine', 'leucine', 1)).toBe(false);
  });
});

describe('fuzzyNearestByAliases — підказка на одрук', () => {
  const DB = [
    { keys: ['methionine', 'метіонін'], code: '2930400000', name: 'DL-Метіонін' },
    { keys: ['lysine', 'лізин'], code: '2922410000', name: 'L-Лізин' },
  ];

  it('ловить одрук у латинській назві', () => {
    const h = fuzzyNearestByAliases(DB, 'L-Methionne 99% feed grade');
    expect(h?.entry.code).toBe('2930400000');
    expect(h?.distance).toBe(1);
  });

  it('ловить одрук у кириличній назві', () => {
    const h = fuzzyNearestByAliases(DB, 'метіонин порошок'); // і замість і/и
    expect(h?.entry.code).toBe('2930400000');
  });

  it('не підказує, коли є точний токен-збіг', () => {
    expect(fuzzyNearestByAliases(DB, 'methionine powder')).toBeNull();
  });

  it('не підказує на несхожому', () => {
    expect(fuzzyNearestByAliases(DB, 'титану діоксид')).toBeNull();
  });

  it('одрук у першій літері не рахується (менше колізій)', () => {
    expect(fuzzyNearestByAliases(DB, 'xethionine')).toBeNull();
  });
});

describe('resolveLine — одрук дає ПІДКАЗКУ, але НЕ проставляє код', () => {
  it('typo «methionne» → код null + попередження про схожість', () => {
    const r = resolveLine({ name: 'L-Methionne feed grade', qtyKg: 100, unitPrice: 5 });
    expect(r.code.value).toBeNull(); // безпека: не вгадуємо код за одруком
    expect(r.warnings.some((w) => w.includes('можливо одрук') && w.includes('2930400000'))).toBe(true);
  });
});
