/**
 * RAG-контекст для AI-перевірок: релевантні теми експертного рулбуку
 * (lib/data/zed_topics.json) підмішуються у CONTEXT, щоб перевірки ЄС/UA
 * СПИРАЛИСЯ на реальні норми, а не на пам'ять моделі (лікуємо галюцинації
 * «правил ЄС» старої версії).
 *
 * Кожен вантаж — Китай/Індія → ЄС (транзит) → Україна (імпорт), тому «костяк»
 * (транзит NCTS, митниця UA, документи) додається завжди; тема-специфічні теми
 * (фарма/GMP, REACH/CLP, прекурсори, холодовий ланцюг, санкції) — за сигналами
 * позицій. Розмір обмежено бюджетом символів.
 */
import zedTopicsRaw from '../data/zed_topics.json';

export interface ZedSection {
  title: string;
  rows: string[][];
}
export interface ZedTopic {
  ico: string;
  topic: string;
  short: string;
  sections: ZedSection[];
}
const TOPICS = zedTopicsRaw as ZedTopic[];

export interface RagItem {
  name?: string | null;
  uctzedCode?: string | null;
  category?: string | null;
  originType?: string | null;
  precursorNote?: string | null;
}

export interface RagSignals {
  blob: string; // усі назви+категорії+типи, нормалізовано, для пошуку ключових слів
  chapters: Set<string>; // 2-значні глави УКТЗЕД
  hasPrecursor: boolean;
}

export function signalsFromItems(items: RagItem[]): RagSignals {
  const parts: string[] = [];
  const chapters = new Set<string>();
  let hasPrecursor = false;
  for (const it of items) {
    parts.push(it.name ?? '', it.category ?? '', it.originType ?? '');
    if (it.precursorNote) hasPrecursor = true;
    const d = String(it.uctzedCode ?? '').replace(/\D/g, '');
    if (d.length >= 2) chapters.add(d.slice(0, 2));
  }
  return { blob: parts.join(' ').toLowerCase(), chapters, hasPrecursor };
}

/** Чи є в blob хоч один із патернів. */
function has(blob: string, rx: RegExp): boolean {
  return rx.test(blob);
}
/** Чи перетинаються глави з набором. */
function anyChapter(chapters: Set<string>, list: string[]): boolean {
  return list.some((c) => chapters.has(c));
}

// Селектори тем (пріоритет згори вниз). rx — по полю topic конкретної теми.
interface Selector {
  rx: RegExp; // яку тему обрати
  when: (s: RagSignals) => boolean; // за якою умовою
}
const SELECTORS: Selector[] = [
  // ── Костяк: кожен вантаж транзитить ЄС і розмитнюється в UA ──
  { rx: /Транзит ЄС/i, when: () => true },
  { rx: /Митниця України/i, when: () => true },
  { rx: /Ключові документи/i, when: () => true },
  // ── Тема-специфічні ──
  {
    rx: /Фармацевтика/i,
    when: (s) => has(s.blob, /фарм|аф[іи]|\bapi\b|антибіотик|ліки|субстанц|excipient|допоміжн/i) || anyChapter(s.chapters, ['30', '29']),
  },
  {
    rx: /GMP · EudraLex/i,
    when: (s) => has(s.blob, /фарм|аф[іи]|\bapi\b|gmp|антибіотик|субстанц/i),
  },
  {
    rx: /REACH · CLP/i,
    when: (s) => has(s.blob, /хім|chemical|кислот|реактив|розчинник|полімер|барвник|пігмент/i) || anyChapter(s.chapters, ['28', '32', '34', '38', '39']),
  },
  {
    rx: /Прекурсори/i,
    when: (s) => s.hasPrecursor || has(s.blob, /прекурсор|подвійн|dual.?use|ефедрин|псевдоефедрин/i),
  },
  {
    rx: /Санкції/i,
    when: (s) => has(s.blob, /санкц|dual.?use|подвійн|export control|подвійного призначення/i),
  },
  {
    rx: /Холодовий ланцюг/i,
    when: (s) => has(s.blob, /температур|cold|gdp|reefer|вакцин|біолог|інсулін|фермент|пробіотик|термолабіл/i),
  },
];

/** Обрані теми (дедуплікація, з обмеженням кількості). */
export function selectTopics(s: RagSignals, maxTopics = 6): ZedTopic[] {
  const picked: ZedTopic[] = [];
  const seen = new Set<string>();
  for (const sel of SELECTORS) {
    if (!sel.when(s)) continue;
    const topic = TOPICS.find((t) => sel.rx.test(t.topic));
    if (topic && !seen.has(topic.topic)) {
      seen.add(topic.topic);
      picked.push(topic);
      if (picked.length >= maxTopics) break;
    }
  }
  return picked;
}

/** Рендер тем у компактний текст із бюджетом символів. */
export function renderRagContext(topics: ZedTopic[], budget = 12000): string {
  const out: string[] = [];
  let used = 0;
  const push = (line: string): boolean => {
    if (used + line.length > budget) return false;
    out.push(line);
    used += line.length + 1;
    return true;
  };
  for (const t of topics) {
    if (!push(`## ${t.ico} ${t.topic} — ${t.short}`)) break;
    for (const sec of t.sections ?? []) {
      if (!push(`### ${sec.title}`)) break;
      for (const row of sec.rows ?? []) {
        const label = String(row[0] ?? '').trim();
        const detail = String(row[1] ?? '').trim().slice(0, 200);
        if (!label && !detail) continue;
        if (!push(`- ${label}: ${detail}`)) break;
      }
    }
  }
  return out.join('\n');
}

export function buildRagContext(items: RagItem[]): string {
  return renderRagContext(selectTopics(signalsFromItems(items)));
}
