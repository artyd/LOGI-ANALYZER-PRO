import { z } from 'zod';
import { callAI, type Provider } from '@/lib/ai/providers';
import { buildSystemPrompt } from '@/lib/ai/prompt';
import { AiResponse } from '@/lib/ai/schema';

export const runtime = 'nodejs';
export const maxDuration = 60;

const ItemIn = z.object({
  name: z.string(),
  uctzedCode: z.string().nullable().optional(),
  codeConfidence: z.string().optional(),
  dutyRatePercent: z.number().nullable().optional(),
  dutyRateSource: z.string().optional(),
  originType: z.string().nullable().optional(),
  recommendedOrigin: z.string().nullable().optional(),
  category: z.string().optional(),
  precursorNote: z.string().nullable().optional(),
});

const Body = z.object({
  provider: z.enum(['openai', 'gemini', 'claude', 'openrouter']),
  apiKey: z.string().min(1),
  model: z.string().optional(),
  items: z.array(ItemIn).min(1).max(60),
});

function buildTariffFacts(items: z.infer<typeof ItemIn>[]): string {
  return items
    .map((it, i) => {
      const lines = [
        `${i + 1}. ${it.name}`,
        `   УКТЗЕД: ${it.uctzedCode ?? 'не визначено'} (джерело: ${it.dutyRateSource ?? '—'}, впевненість коду: ${it.codeConfidence ?? '—'})`,
        `   Ставка мита: ${it.dutyRatePercent ?? '?'}%`,
        `   Походження (попередньо): ${it.originType ?? '—'}${it.recommendedOrigin ? `; рекомендований тип: ${it.recommendedOrigin}` : ''}${it.category ? `; категорія: ${it.category}` : ''}`,
      ];
      if (it.precursorNote) lines.push(`   УВАГА (прекурсор/контроль): ${it.precursorNote}`);
      return lines.join('\n');
    })
    .join('\n');
}

function buildUserPrompt(items: z.infer<typeof ItemIn>[]): string {
  const list = items.map((it, i) => `${i + 1}. ${it.name}`).join('\n');
  return `Проаналізуй позиції нижче з погляду ЛОГІСТА та МИТНОГО БРОКЕРА.
Для КОЖНОЇ позиції поверни:
- euChecks[]: практичні перевірки транзиту через ЄС (NCTS/T1, MRN, ICS2/ENS, CMR/AWB/BL, packing list, seal, gross/net, BCP/TRACES, фіто/вет, ADR/SDS, температурний режим);
- uaChecks[]: перевірки розмитнення в Україні (ДПСС, фіто/вет, митна лабораторія, код/опис, документи, платежі, температурний режим);
- originType, productionMethod, originShortNote, category, applications, hazardAnalysis, storageRequirements;
- risk ("Критичний"/"Середній"/"Низький") + riskNote; needsReview.
Кожна перевірка: {item, status: "green"|"yellow"|"red", note}. Спирайся на CONTEXT вище; НЕ рахуй гроші; НЕ додавай позицій, яких немає у списку.
Якщо впевненість коду низька або код не визначено — став needsReview=true і додай перевірку класифікації/лабораторної ідентифікації. Не дублюй те, що вже випливає з рекомендованого типу походження — додавай перевірки, специфічні саме для цього товару, маршруту й документів.

СПИСОК ПОЗИЦІЙ:
${list}

Поверни строгий JSON: { "items": [ ... ], "criticalAlert": "", "nctsList": [] }.`;
}

/** Виймає JSON навіть якщо модель обгорнула у markdown. */
function extractJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(t);
  } catch {
    const a = t.indexOf('{');
    const b = t.lastIndexOf('}');
    if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
    throw new Error('Не вдалося розібрати JSON-відповідь AI.');
  }
}

export async function POST(req: Request): Promise<Response> {
  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch (e) {
    return Response.json({ error: `Некоректний запит: ${(e as Error).message}` }, { status: 400 });
  }

  const system = buildSystemPrompt({ tariffFacts: buildTariffFacts(parsed.items), ragContext: '' });
  const user = buildUserPrompt(parsed.items);

  let raw: string;
  try {
    raw = await callAI({
      provider: parsed.provider as Provider,
      apiKey: parsed.apiKey,
      model: parsed.model,
      system,
      user,
      jsonMode: true,
      maxTokens: 8000,
    });
  } catch (e) {
    return Response.json({ error: `AI: ${(e as Error).message}` }, { status: 502 });
  }

  try {
    const result = AiResponse.parse(extractJson(raw));
    return Response.json(result);
  } catch (e) {
    return Response.json(
      { error: `Не вдалося розібрати відповідь AI: ${(e as Error).message}` },
      { status: 502 },
    );
  }
}
