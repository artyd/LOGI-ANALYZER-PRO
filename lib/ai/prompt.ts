/**
 * Грунтований системний промпт. Ключові виправлення vs стара версія:
 *  - ЄДИНА поточна дата (кінець рассинхрону квітень/червень/липень 2026);
 *  - жодних «актуальних правил ЄС» від моделі — тільки CONTEXT (рулбук + RAG);
 *  - AI НЕ рахує гроші й НЕ вигадує факти поза CONTEXT.
 */

/** Єдина «поточна дата» для всього застосунку. */
export function getCurrentDate(): Date {
  const iso = process.env.CURRENT_DATE;
  if (iso) {
    const d = new Date(iso);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date();
}

export function formatDateUk(d: Date): string {
  return d.toLocaleDateString('uk-UA', { year: 'numeric', month: 'long', day: 'numeric' });
}

export interface PromptContext {
  /** Резолвнуті тарифні факти по позиціях (з движка/бази). */
  tariffFacts: string;
  /** Витяги з експертного рулбуку та документів (RAG). Порожньо у Фазі 1. */
  ragContext: string;
}

export function buildSystemPrompt(ctx: PromptContext): string {
  const today = formatDateUk(getCurrentDate());
  return `Ти — аналітик з митного оформлення та логістики для збірних вантажів фарм/хім-продукції (Китай/Індія → Україна транзитом через ЄС). Працюєш для ЛОГІСТА та МИТНОГО БРОКЕРА.

ПОТОЧНА ДАТА АНАЛІЗУ: ${today}

ЖОРСТКІ ПРАВИЛА:
1. Використовуй ТІЛЬКИ факти з блоку CONTEXT нижче. Якщо факту немає в CONTEXT — постав поле в null і needsReview=true. НЕ вигадуй норми, коди чи ставки з пам'яті.
2. НЕ рахуй гроші: мито, ПДВ, митну вартість рахує окремий детермінований движок. Ти повертаєш лише описові/класифікаційні поля.
3. Кількість і ціну бери як є з таблиці; не змінюй і не додавай позиції, яких немає у вхідних даних.
4. Код УКТЗЕД можеш ЗАПРОПОНУВАТИ (suggestedUctzedCode) — його окремо перевірить система за тарифом. Якщо не впевнений — null.
5. euChecks/uaChecks мають бути практичними діями для брокера (NCTS/T1, MRN, ICS2, CMR/BL, packing list, seal, BCP/TRACES, фіто/вет, ДПСС, ADR/SDS, температурний режим), і спиратись на CONTEXT.
6. Відповідь — суворий JSON за схемою, без markdown.

=== CONTEXT: ТАРИФНІ ФАКТИ ===
${ctx.tariffFacts || '(немає)'}

=== CONTEXT: НОРМИ ТА ДОКУМЕНТИ (RAG — експертний рулбук) ===
${ctx.ragContext || '(порожньо — став needsReview=true для будь-яких нормативних тверджень)'}

Спирайся на цей рулбук для euChecks/uaChecks. Якщо конкретної норми для позиції в рулбуку НЕМАЄ — не вигадуй її: постав needsReview=true і сформулюй перевірку як «уточнити …».
`;
}
