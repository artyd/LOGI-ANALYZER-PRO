import { describe, it, expect } from 'vitest';
import { lookupHsByDescription } from '../lib/engines/hsmatch';

/**
 * Семантичний fallback за описом HS. Головна вимога — ВИСОКА ТОЧНІСТЬ:
 * краще мовчати (null), ніж запропонувати чужий код. Тому тут і позитивні
 * кейси (речовина зі своїм ім'ям у HS-6), і негативні (категоріальні слова
 * НЕ мають давати код).
 */
describe('lookupHsByDescription — токен-ідентичність', () => {
  it.each([
    ['Methionine', '293040'],
    ['L-Lysine sulphate feed grade', '292241'],
    ['Ephedrine HCl', '293941'],
    ['Caffeine anhydrous powder', '293930'],
    ['Citric acid monohydrate', '291814'],
    ['Sorbitol', '290544'],
  ])('матчить «%s» → %s', (name, code) => {
    const r = lookupHsByDescription(name);
    expect(r?.code6).toBe(code);
  });

  it.each([
    ['Hyaluronic acid', 'лише «acid» — не dairy/acids'],
    ['Ascorbic acid (Vitamin C)', 'нема «ascorbic» у HS-6 — не вгадувати вітамін B5'],
    ['Xanthan gum', 'лише «gum» — не gum arabic'],
    ['Some random food additive powder', 'лише «additive» — категорія, не речовина'],
    ['Paracetamol', 'нема власного імені в HS-6'],
    ['Загадковий товар XYZ', 'сміття'],
    ['Амоксицилін тригідрат', 'кирилиця — токенів у англ. словнику нема'],
  ])('мовчить на «%s» (%s)', (name) => {
    expect(lookupHsByDescription(name)).toBeNull();
  });

  it('пропозиція за специфічним ім\'ям → confidence medium', () => {
    expect(lookupHsByDescription('Methionine')?.confidence).toBe('medium');
  });
});
