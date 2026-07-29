import { describe, it, expect } from 'vitest';
import { lookupMfnRate } from '../lib/engines/mfn';

describe('lookupMfnRate (WITS/UNCTAD, реальні MFN-ставки UA HS-6)', () => {
  it('антибіотики 294110 = 0%', () => {
    const m = lookupMfnRate('2941100000');
    expect(m?.ratePercent).toBe(0);
    expect(m?.hs6).toBe('294110');
    expect(m?.ranged).toBe(false);
  });
  it('лізин 292241 та метіонін 293040 = 6.5% (точніше за грубу главу 29=0%)', () => {
    expect(lookupMfnRate('2922410000')?.ratePercent).toBe(6.5);
    expect(lookupMfnRate('2930400000')?.ratePercent).toBe(6.5);
  });
  it('ліки 300490 = 0%', () => {
    expect(lookupMfnRate('3004900000')?.ratePercent).toBe(0);
  });
  it('позиція з діапазоном позначається ranged', () => {
    expect(lookupMfnRate('3913900090')?.ranged).toBe(true);
  });
  it('невідомий/короткий код → null', () => {
    expect(lookupMfnRate('99')).toBeNull();
    expect(lookupMfnRate('')).toBeNull();
  });
});
