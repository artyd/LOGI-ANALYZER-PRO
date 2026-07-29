import { z } from 'zod';
import { callAI, PROVIDERS, type Provider } from '@/lib/ai/providers';

export const runtime = 'nodejs';

const Body = z.object({
  provider: z.enum(['openai', 'gemini', 'claude', 'openrouter']),
  apiKey: z.string().min(1),
  system: z.string().min(1),
  user: z.string().min(1),
  maxTokens: z.number().int().positive().max(32000).optional(),
  jsonMode: z.boolean().optional(),
  model: z.string().optional(),
});

export async function POST(req: Request): Promise<Response> {
  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch (e) {
    return Response.json(
      { error: 'Некоректний запит', details: (e as Error).message },
      { status: 400 },
    );
  }

  try {
    const content = await callAI({ ...parsed, provider: parsed.provider as Provider });
    // Ключ ніколи не логуємо і не повертаємо.
    return Response.json({ content });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}

export function GET(): Response {
  return Response.json({
    providers: Object.fromEntries(
      Object.entries(PROVIDERS).map(([k, v]) => [k, { label: v.label, defaultModel: v.defaultModel }]),
    ),
  });
}
