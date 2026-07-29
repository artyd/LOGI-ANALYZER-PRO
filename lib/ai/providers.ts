/**
 * Серверний BYOK-виклик AI. Порт callAI (index.html @6073), але server-side:
 *  - ключі приходять на кожен запит, не зберігаються і не логуються на сервері;
 *  - прибрано заголовок anthropic-dangerous-direct-browser-access (не потрібен поза браузером);
 *  - модель можна перевизначити (дефолти — сучасні).
 */
export type Provider = 'openai' | 'gemini' | 'claude' | 'openrouter';

export interface ProviderMeta {
  label: string;
  defaultModel: string;
}

export const PROVIDERS: Record<Provider, ProviderMeta> = {
  openai: { label: 'OpenAI', defaultModel: 'gpt-4o' },
  gemini: { label: 'Gemini', defaultModel: 'gemini-2.0-flash' },
  claude: { label: 'Claude', defaultModel: 'claude-sonnet-5' },
  openrouter: { label: 'OpenRouter', defaultModel: 'openai/gpt-4o' },
};

export interface CallAiParams {
  provider: Provider;
  apiKey: string;
  system: string;
  user: string;
  maxTokens?: number;
  jsonMode?: boolean;
  model?: string;
}

export async function callAI(params: CallAiParams): Promise<string> {
  const { provider, apiKey, system, user } = params;
  const maxTokens = params.maxTokens ?? 8000;
  const jsonMode = params.jsonMode ?? true;
  const model = params.model || PROVIDERS[provider]?.defaultModel;
  if (!apiKey) throw new Error('API ключ не надано.');
  if (!model) throw new Error(`Невідомий провайдер: ${provider}`);

  if (provider === 'openai' || provider === 'openrouter') {
    const endpoint =
      provider === 'openai'
        ? 'https://api.openai.com/v1/chat/completions'
        : 'https://openrouter.ai/api/v1/chat/completions';
    const body: Record<string, unknown> = {
      model,
      max_tokens: maxTokens,
      temperature: 0.0,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    };
    if (jsonMode) body.response_format = { type: 'json_object' };
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw await providerError(res, provider);
    const data = await res.json();
    return data.choices[0].message.content;
  }

  if (provider === 'gemini') {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const body = {
      system_instruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: {
        maxOutputTokens: maxTokens,
        temperature: 0.0,
        ...(jsonMode ? { responseMimeType: 'application/json' } : {}),
      },
    };
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw await providerError(res, provider);
    const data = await res.json();
    return data.candidates[0].content.parts[0].text;
  }

  if (provider === 'claude') {
    const finalUser = jsonMode ? `${user}\n\nПоверни ТІЛЬКИ валідний JSON, без markdown.` : user;
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: finalUser }],
      }),
    });
    if (!res.ok) throw await providerError(res, provider);
    const data = await res.json();
    return data.content[0].text;
  }

  throw new Error(`Невідомий провайдер: ${provider}`);
}

async function providerError(res: Response, provider: Provider): Promise<Error> {
  let msg = `${provider} API помилка ${res.status}`;
  try {
    const e = await res.json();
    msg = e?.error?.message || msg;
  } catch {
    /* ignore */
  }
  return new Error(msg);
}
