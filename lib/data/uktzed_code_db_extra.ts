import type { UktzedEntry } from './index';

/**
 * Оверлей синонімів до УКТЗЕД-словника (не змінює вилучену базу).
 * ВАЖЛИВО: усі коди тут — це ті ж коди, що вже є в базі; ми лише розширюємо
 * розпізнавання назв (укр/рос/англ/торгові форми). Нових/непевних кодів НЕ додаємо,
 * щоб не знижувати точність.
 */
export const UKTZED_CODE_DB_EXTRA: UktzedEntry[] = [
  // ── Вітаміни (2936) — переважно бракувало англ. хім. назв і форм ──
  { keys: ['ascorbic acid', 'ascorbate', 'sodium ascorbate', 'аскорбат натрію', 'вит с', 'l-ascorbic acid'], code: '2936270000', name: 'Вітамін C' },
  { keys: ['vitamin d3', 'vit d3', 'colecalciferol'], code: '2936299000', name: 'Вітамін D3' },
  { keys: ['vitamin b1', 'thiamine hcl', 'thiamine mononitrate', 'тіаміну гідрохлорид', 'тіаміну мононітрат'], code: '2936210000', name: 'Вітамін B1' },
  { keys: ['vitamin b2', 'riboflavin phosphate'], code: '2936220000', name: 'Вітамін B2' },
  { keys: ['vitamin b6', 'pyridoxine hcl', 'піридоксину гідрохлорид'], code: '2936240000', name: 'Вітамін B6' },
  { keys: ['vitamin b12', 'cobalamin', 'кобаламін'], code: '2936291000', name: 'Вітамін B12' },
  { keys: ['vitamin a', 'retinol', 'retinyl acetate', 'ретинол пальмітат', 'retinyl palmitate'], code: '2936100000', name: 'Вітамін A' },
  { keys: ['vitamin e', 'tocopheryl acetate', 'alpha-tocopherol', 'токоферол ацетат', 'токоферолу ацетат'], code: '2936280000', name: 'Вітамін E' },
  { keys: ['vitamin b5', 'calcium pantothenate', 'кальцію пантотенат', 'пантотенат кальцію', 'd-calcium pantothenate'], code: '2936500000', name: 'Пантотенат кальцію (B5)' },
  { keys: ['vitamin b3', 'niacinamide', 'nicotinic acid', 'нікотинова кислота', 'нікотинамід'], code: '2936230000', name: 'Вітамін B3' },
  { keys: ['vitamin k3', 'menadione sodium bisulfite', 'менадіон натрію бісульфіт'], code: '2936290000', name: 'Вітамін K3' },
  { keys: ['vitamin b9', 'folacin', 'фолацин'], code: '2936290000', name: 'Фолієва кислота (B9)' },
  { keys: ['vitamin h', 'd-biotin', 'д-біотин'], code: '2936290000', name: 'Біотин (B7/H)' },
];
