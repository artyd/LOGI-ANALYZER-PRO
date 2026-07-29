import { describe, it, expect } from 'vitest';
import { validateUktzedStructure, codeClassPlausible } from '../lib/engines/validate';

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
