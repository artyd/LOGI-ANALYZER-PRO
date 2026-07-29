import { describe, it, expect } from 'vitest';
import { validateUktzedStructure, codeClassPlausible, codeExistsInHs, hsHeadingDescription } from '../lib/engines/validate';
import { resolveLine } from '../lib/engines/resolve';

describe('validateUktzedStructure', () => {
  it('валідний 10-значний код', () => {
    const v = validateUktzedStructure('2941100000');
    expect(v.structureValid).toBe(true);
    expect(v.chapter).toBe('29');
  });
  it('відхиляє некоректну довжину', () => {
    expect(validateUktzedStructure('29411').structureValid).toBe(false);
  });
  it('відхиляє неіснуючу главу (99/00)', () => {
    expect(validateUktzedStructure('9900000000').structureValid).toBe(false);
    expect(validateUktzedStructure('0000000000').structureValid).toBe(false);
  });
  it('приймає код із роздільниками', () => {
    expect(validateUktzedStructure('3913 90 00 90').structureValid).toBe(true);
  });
});

describe('codeClassPlausible', () => {
  it('антибіотик у гл.2941 — правдоподібно', () => {
    expect(codeClassPlausible('2941100000', 'Антибіотик').plausible).toBe(true);
  });
  it('антибіотик у гл.39 — НЕправдоподібно (ловить помилку)', () => {
    const r = codeClassPlausible('3913900090', 'Антибіотик ветеринарний');
    expect(r.plausible).toBe(false);
    expect(r.note).toMatch(/класифікац/i);
  });
  it('вітамін поза 2936 — прапорець', () => {
    expect(codeClassPlausible('2922410000', 'Вітамін C').plausible).toBe(false);
  });
  it('невідома категорія — не чіпаємо', () => {
    expect(codeClassPlausible('3824999609', 'Промислова хімія').plausible).toBe(true);
  });
});

describe('HS-номенклатура (UN Comtrade)', () => {
  it('реальна підпозиція існує в HS', () => {
    expect(codeExistsInHs('2941100000')).toBe(true); // 294110 антибіотики
    expect(codeExistsInHs('2922410000')).toBe(true); // 292241 лізин
  });
  it('вигадана підпозиція не існує', () => {
    expect(codeExistsInHs('2988880000')).toBe(false); // гл.29 валідна, позиція 2988 — вигадана
  });
  it('офіційний опис позиції', () => {
    expect(hsHeadingDescription('2941100000')).toBe('Antibiotics');
  });
});

describe('resolveLine: відхилення неіснуючих AI-кодів', () => {
  it('AI-код без реальної підпозиції HS відхиляється', () => {
    const r = resolveLine({ name: 'Загадковий товар', qtyKg: 1, unitPrice: 1, aiSuggestedCode: '9999999999' });
    expect(r.code.value).toBeNull();
    expect(r.warnings.some((w) => /відхилено/i.test(w))).toBe(true);
  });
  it('валідний AI-код HS приймається', () => {
    const r = resolveLine({ name: 'Щось органічне', qtyKg: 1, unitPrice: 1, aiSuggestedCode: '2933990000' });
    expect(r.code.value).toBe('2933990000');
    expect(r.code.source).toBe('ai');
  });
});
