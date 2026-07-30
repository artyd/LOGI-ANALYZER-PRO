import { describe, it, expect } from 'vitest';
import { signalsFromItems, selectTopics, buildRagContext } from '../lib/ai/rag';

describe('RAG — вибір тем рулбуку за сигналами позицій', () => {
  it('сигнали: глави, прекурсор, blob', () => {
    const s = signalsFromItems([
      { name: 'Амоксицилін', uctzedCode: '2941100000', category: 'антибіотик', precursorNote: 'таблиця 1' },
    ]);
    expect(s.chapters.has('29')).toBe(true);
    expect(s.hasPrecursor).toBe(true);
    expect(s.blob).toContain('антибіотик');
  });

  it('костяк присутній завжди (транзит ЄС, митниця UA, документи)', () => {
    const topics = selectTopics(signalsFromItems([{ name: 'Будь-що', uctzedCode: null }]));
    const joined = topics.map((t) => t.topic).join(' | ');
    expect(joined).toMatch(/Транзит ЄС/);
    expect(joined).toMatch(/Митниця України/);
    expect(joined).toMatch(/Ключові документи/);
  });

  it('фарм/АФІ → додає Фармацевтику і GMP', () => {
    const topics = selectTopics(signalsFromItems([{ name: 'API субстанція', category: 'АФІ' }]));
    const joined = topics.map((t) => t.topic).join(' | ');
    expect(joined).toMatch(/Фармацевтика/);
    expect(joined).toMatch(/GMP/);
  });

  it('хімія (глава 28) → додає REACH · CLP', () => {
    const topics = selectTopics(signalsFromItems([{ name: 'Сірчана кислота', uctzedCode: '2807000000', category: 'хімікат' }]));
    expect(topics.map((t) => t.topic).join(' | ')).toMatch(/REACH · CLP/);
  });

  it('прекурсор → додає тему прекурсорів', () => {
    const topics = selectTopics(signalsFromItems([{ name: 'Ephedrine', precursorNote: 'таблиця 1' }]));
    expect(topics.map((t) => t.topic).join(' | ')).toMatch(/Прекурсори/);
  });

  it('термолабільне → додає холодовий ланцюг', () => {
    const topics = selectTopics(signalsFromItems([{ name: 'Інсулін', category: 'біологічний, температурний режим' }]));
    expect(topics.map((t) => t.topic).join(' | ')).toMatch(/Холодовий ланцюг/);
  });

  it('кількість тем обмежена', () => {
    const topics = selectTopics(
      signalsFromItems([{ name: 'API ефедрин dual-use', uctzedCode: '2939410000', category: 'АФІ хімікат', precursorNote: 'т.1' }]),
      6,
    );
    expect(topics.length).toBeLessThanOrEqual(6);
  });

  it('buildRagContext — непорожній, у межах бюджету, містить норми', () => {
    const ctx = buildRagContext([{ name: 'Амоксицилін', uctzedCode: '2941100000', category: 'антибіотик' }]);
    expect(ctx.length).toBeGreaterThan(0);
    expect(ctx.length).toBeLessThanOrEqual(12000);
    expect(ctx).toMatch(/## /); // є заголовки тем
  });
});
