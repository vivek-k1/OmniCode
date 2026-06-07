/**
 * providers.js
 * Provider/model registry + a unified `callModel` that formats the request
 * payload to match each vendor's SDK/REST contract, then normalizes the
 * response into a single string.
 *
 * Keys are read by the caller from localStorage and passed in explicitly so
 * this module stays free of side effects.
 */

export const PROVIDERS = {
  openai: {
    id: 'openai',
    label: 'OpenAI',
    storageKey: 'byok_openai_key',
    keyHint: 'sk-...',
    docsUrl: 'https://platform.openai.com/api-keys',
    models: [
      { id: 'gpt-5.5', label: 'GPT-5.5' },
      { id: 'gpt-5.4', label: 'GPT-5.4' },
      { id: 'gpt-5.4-mini', label: 'GPT-5.4 mini' },
      { id: 'gpt-4.1', label: 'GPT-4.1' },
      { id: 'gpt-4o', label: 'GPT-4o' },
    ],
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic',
    storageKey: 'byok_anthropic_key',
    keyHint: 'sk-ant-...',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    models: [
      { id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
      { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
      { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
      { id: 'claude-opus-4-5', label: 'Claude Opus 4.5' },
    ],
  },
  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    storageKey: 'byok_gemini_key',
    keyHint: 'AIza...',
    docsUrl: 'https://aistudio.google.com/app/apikey',
    models: [
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
      { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite' },
    ],
  },
};

export const PROVIDER_LIST = Object.values(PROVIDERS);

/** Find which provider a model id belongs to. */
export function providerForModel(modelId) {
  for (const p of PROVIDER_LIST) {
    if (p.models.some((m) => m.id === modelId)) return p;
  }
  return null;
}

/** Default selection used on first load. */
export const DEFAULT_PROVIDER = 'anthropic';
export const DEFAULT_MODEL = 'claude-sonnet-4-6';

/* ------------------------------------------------------------------ */
/* Request builders (per vendor)                                       */
/* ------------------------------------------------------------------ */

function buildOpenAIRequest({ apiKey, model, system, messages, maxTokens }) {
  return {
    url: 'https://api.openai.com/v1/chat/completions',
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: system },
          ...messages.map((m) => ({ role: m.role, content: m.content })),
        ],
      }),
    },
    extract: (data) => data?.choices?.[0]?.message?.content ?? '',
  };
}

function buildAnthropicRequest({ apiKey, model, system, messages, maxTokens }) {
  return {
    url: 'https://api.anthropic.com/v1/messages',
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        // Required for browser-originated requests.
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      }),
    },
    extract: (data) =>
      Array.isArray(data?.content)
        ? data.content.map((c) => c.text || '').join('')
        : '',
  };
}

function buildGeminiRequest({ apiKey, model, system, messages, maxTokens }) {
  // Gemini uses "user"/"model" roles and a separate systemInstruction field.
  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
  return {
    url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
      apiKey
    )}`,
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents,
        generationConfig: { maxOutputTokens: maxTokens },
      }),
    },
    extract: (data) =>
      data?.candidates?.[0]?.content?.parts
        ?.map((p) => p.text || '')
        .join('') ?? '',
  };
}

const BUILDERS = {
  openai: buildOpenAIRequest,
  anthropic: buildAnthropicRequest,
  gemini: buildGeminiRequest,
};

/** Build a provider-correct request descriptor without sending it. */
export function buildRequest(providerId, opts) {
  const builder = BUILDERS[providerId];
  if (!builder) throw new Error(`Unknown provider: ${providerId}`);
  return builder(opts);
}

/**
 * Call the selected model and return the assistant text.
 * @param {object} params
 * @param {string} params.providerId
 * @param {string} params.model
 * @param {string} params.apiKey
 * @param {string} params.system
 * @param {Array<{role:'user'|'assistant', content:string}>} params.messages
 * @param {number} [params.maxTokens]
 * @param {AbortSignal} [params.signal]
 */
export async function callModel({
  providerId,
  model,
  apiKey,
  system,
  messages,
  maxTokens = 8192,
  signal,
}) {
  if (!apiKey) {
    throw new Error(
      `No API key set for ${PROVIDERS[providerId]?.label || providerId}. Add it in the keys drawer.`
    );
  }

  const { url, init, extract } = buildRequest(providerId, {
    apiKey,
    model,
    system,
    messages,
    maxTokens,
  });

  let res;
  try {
    res = await fetch(url, { ...init, signal });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new Error(
      `Network error reaching ${providerId}. Browser CORS or connectivity may be blocking the request.\n${err.message || err}`
    );
  }

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    const apiMsg =
      data?.error?.message ||
      data?.error ||
      data?.message ||
      text ||
      `HTTP ${res.status}`;
    throw new Error(`${PROVIDERS[providerId]?.label || providerId} API error (${res.status}): ${apiMsg}`);
  }

  const content = extract(data);
  if (!content) {
    throw new Error('The model returned an empty response.');
  }
  return content;
}
