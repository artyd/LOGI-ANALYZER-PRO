import { describe, it, expect } from 'vitest';
import {
  lookupUktzedCode,
  lookupDutyRate,
  lookupProductOrigin,
  lookupAdr,
  checkPrecursor,
  normalize,
} from '../lib/engines/classify';
import { PRODUCT_ORIGIN_KB, UKTZED_CODE_DB, PRECURSOR_WATCH } from '../lib/data';

describe('дані мігровано', () => {
  it('довідники непорожні', () => {
    expect(PRODUCT_ORIGIN_KB.length).toBeGreaterThan(300);
    expect(UKTZED_CODE_DB.length).toBeGreaterThan(60);
    expect(PRECURSOR_WATCH.length).toBeGreaterThan(15);
  });
});

describe('normalize', () => {
  it('прибирає пунктуацію і регістр', () => {
    expect(normalize('L-Лізин, HCl.')).toBe('l-лізин hcl');
  });
});

describe('lookupUktzedCode', () => {
  it('знаходить код за укр/рос/англ назвою', () => {
    expect(lookupUktzedCode('Амоксицилін тригідрат')?.code).toBe('2941100000');
    expect(lookupUktzedCode('vitamin c порошок')?.code).toBe('2936270000');
    expect(lookupUktzedCode('аскорбінова кислота')?.code).toBe('2936270000');
  });
  it('невідома назва → null', () => {
    expect(lookupUktzedCode('щось невідоме xyz')).toBeNull();
  });
});

describe('lookupDutyRate (груба таблиця, kb_coarse)', () => {
  it('гл.29 → 0%', () => {
    const d = lookupDutyRate('2941100000');
    expect(d?.ratePercent).toBe(0);
    expect(d?.source).toBe('kb_coarse');
  });
  it('гл.39 → 6.5%', () => {
    expect(lookupDutyRate('3913900090')?.ratePercent).toBe(6.5);
  });
  it('найдовший префікс виграє (2905 → 6.5 попри 29→0)', () => {
    expect(lookupDutyRate('2905110000')?.ratePercent).toBe(6.5);
  });
  it('короткий/порожній код → null', () => {
    expect(lookupDutyRate('29')).toBeNull();
    expect(lookupDutyRate('')).toBeNull();
  });
});

describe('lookupProductOrigin', () => {
  it('лізин → ферментаційне', () => {
    expect(lookupProductOrigin('L-Лізин сульфат')?.originType).toBe('ферментаційне');
  });
  it('DL-метіонін → синтетичне', () => {
    expect(lookupProductOrigin('DL-метіонін кормовий')?.originType).toBe('синтетичне');
  });
});

describe('checkPrecursor', () => {
  it('ефедрин → таблиця 1', () => {
    const h = checkPrecursor('Ephedrine HCl');
    expect(h?.table).toBe(1);
  });
  it('за кодом перманганату калію → знайдено', () => {
    const h = checkPrecursor('перманганат калію', '2841610000');
    expect(h).not.toBeNull();
  });
  it('звичайний товар → null', () => {
    expect(checkPrecursor('лактоза', '1702110000')).toBeNull();
  });
});

describe('lookupAdr', () => {
  it('камфора → UN2717', () => {
    expect(lookupAdr('камфора синтетична')?.un).toBe('UN2717');
  });
});
