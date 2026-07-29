import { describe, it, expect } from 'vitest';
import { matchByAliases, normalizeName, contentTokens } from '../lib/engines/match';
import { lookupUktzedCode, lookupProductOriginMatch } from '../lib/engines/classify';

describe('normalizeName / contentTokens', () => {
  it('нормалізує апострофи, ё, роздільники', () => {
    expect(normalizeName("Кальцію хлорид (безводний)")).toBe('кальцію хлорид безводний');
    expect(normalizeName('L-Лізин')).toBe('l лізин');
  });
  it('відкидає шумові й короткі токени', () => {
    expect(contentTokens('L-Лізин сульфат 70% GMP порошок')).toEqual(['лізин', 'сульфат']);
  });
});

describe('matchByAliases — точність і впевненість', () => {
  const db = [
    { keys: ['амоксицилін', 'amoxicillin'], code: 'A' },
    { keys: ['ампіцилін', 'ampicillin'], code: 'B' },
    { keys: ['метіонін', 'methionine'], code: 'C' },
  ];
  it('точний збіг слова → high', () => {
    const m = matchByAliases(db, 'Амоксицилін тригідрат 98%');
    expect(m?.entry.code).toBe('A');
    expect(m?.confidence).toBe('high');
  });
  it('англомовна назва теж матчиться', () => {
    expect(matchByAliases(db, 'Amoxicillin trihydrate')?.entry.code).toBe('A');
  });
  it('не плутає схожі назви (амокси- vs ампі-)', () => {
    expect(matchByAliases(db, 'ампіцилін натрію')?.entry.code).toBe('B');
  });
  it('невідома назва → null або low', () => {
    const m = matchByAliases(db, 'загадковий продукт хyz');
    expect(m === null || m.confidence === 'low').toBe(true);
  });
});

describe('lookupUktzedCode — стійкість до брудних назв', () => {
  it('назва з грейдом/відсотком', () => {
    expect(lookupUktzedCode('Амоксицилін тригідрат 98% GMP')?.code).toBe('2941100000');
  });
  it('вітамін С у різних формах', () => {
    expect(lookupUktzedCode('Аскорбінова кислота (вітамін C)')?.code).toBe('2936270000');
    expect(lookupUktzedCode('Ascorbic acid, food grade')?.code).toBe('2936270000');
  });
  it('нерелевантна назва не дає хибного коду', () => {
    expect(lookupUktzedCode('пластиковий піддон euro')).toBeNull();
  });
});

describe('lookupProductOriginMatch — впевненість походження', () => {
  it('лізин → ферментаційне з високою впевненістю', () => {
    const m = lookupProductOriginMatch('L-Лізин сульфат 70%');
    expect(m?.entry.originType).toBe('ферментаційне');
    expect(m?.confidence).toBe('high');
  });
  it('DL-метіонін → синтетичне', () => {
    expect(lookupProductOriginMatch('DL-метіонін кормовий')?.entry.originType).toBe('синтетичне');
  });
});
