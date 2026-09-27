// Cudic AI LLM client — runs in the extension host (worker).
// One engine for chat + autocomplete + model lists across every preset.
// Loopback engines go direct; everything cloud goes through our same-origin
// proxy (browsers block provider CORS). The proxy needs the user's Cudic
// login token, pushed in from the main thread (workers can't read
// localStorage). Provider keys live in extension globalState, never on disk.
import { ProviderPreset, isLoopbackUrl } from './providers';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CallOpts {
  preset: ProviderPreset;
  baseOverride?: string;
  key: string;
  model: string;
  messages: ChatMessage[];
  signal: AbortSignal;
  onToken: (t: string) => void;
  temperature?: number;
  maxTokens?: number;
}

let supaToken: string | null = null;
export function setSupaToken(t: string | null): void {
  supaToken = t;
}

function withQuery(base: string, extra?: Record<string, string>): string {
  if (!extra) return base;
  const q = Object.entries(extra)
    .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v))
    .join('&');
  return base + (base.includes('?') ? '&' : '?') + q;
}

function baseOf(preset: ProviderPreset, override?: string): string {
  const b = (override || preset.base || '').trim().replace(/\/+$/, '');
  if (!b) throw new Error('Set the endpoint URL first (Custom endpoint preset).');
  return withQuery(b, preset.extraQuery);
}

interface BuiltCall {
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

function buildChat(preset: ProviderPreset, model: string, messages: ChatMessage[], key: string, base: string, temperature?: number, maxTokens?: number): BuiltCall {
  const temp = temperature ?? 0.3;
  if (!model.trim()) throw new Error('Pick a model first.');
  if (preset.format === 'anthropic') {
    if (!key && !preset.keyOptional) throw new Error('Paste your ' + preset.keyLabel + ' first.');
    const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const rest = messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role, content: m.content }));
    return {
      url: base + '/messages',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: { model, max_tokens: maxTokens ?? 4096, stream: true, temperature: temp, ...(system ? { system } : {}), messages: rest }
    };
  }
  if (preset.format === 'gemini') {
    if (!key && !preset.keyOptional) throw new Error('Paste your ' + preset.keyLabel + ' first.');
    const contents = messages.filter((m) => m.role !== 'system').map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));
    const sys = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    return {
      url: base + '/models/' + encodeURIComponent(model) + ':streamGenerateContent?alt=sse',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: { ...(sys ? { system_instruction: { parts: [{ text: sys }] } } : {}), contents, generationConfig: { temperature: temp, ...(maxTokens ? { maxOutputTokens: maxTokens } : {}) } }
    };
  }
  if (!key && !preset.keyOptional) throw new Error('Paste your ' + preset.keyLabel + ' first.');
  return {
    url: base + '/chat/completions',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
    body: { model, stream: true, temperature: temp, ...(maxTokens ? { max_tokens: maxTokens } : {}), messages }
  };
}

function deltaOf(format: string, obj: Record<string, unknown>): string | null {
  try {
    if (format === 'anthropic') {
      if (obj.type === 'content_block_delta') {
        const d = obj.delta as Record<string, unknown> | undefined;
        return typeof d?.text === 'string' ? (d.text as string) : null;
      }
      return null;
    }
    if (format === 'gemini') {
      const cands = obj.candidates as Array<Record<string, unknown>> | undefined;
      const parts = (cands?.[0]?.content as Record<string, unknown> | undefined)?.parts as
        Array<Record<string, unknown>> | undefined;
      if (Array.isArray(parts)) return parts.map((p) => (typeof p.text === 'string' ? p.text : '')).join('');
      return null;
    }
    const choices = obj.choices as Array<Record<string, unknown>> | undefined;
    const delta = choices?.[0]?.delta as Record<string, unknown> | undefined;
    return typeof delta?.content === 'string' ? (delta.content as string) : null;
  } catch {
    return null;
  }
}

async function readError(res: Response): Promise<string> {
  try {
    const t = await res.text();
    const j = JSON.parse(t) as Record<string, unknown>;
    const e = j.error as Record<string, unknown> | string | undefined;
    if (typeof e === 'string') return e;
    if (e && typeof e.message === 'string') return e.message;
    return t.slice(0, 220) || 'HTTP ' + res.status;
  } catch {
    return 'HTTP ' + res.status;
  }
}

// Upstream errors are cryptic — translate the common ones into actions.
export function friendlyError(providerName: string, raw: string): string {
  if (/free tier.*within opencode|only be used from within opencode/i.test(raw))
    return 'Zen free models only work inside OpenCode\u2019s own apps — pick a paid Zen model or another provider.';
  if (/sign in on the cudic site/i.test(raw)) return raw;
  const m = raw.toLowerCase();
  if (/401|invalid api key|invalid_api_key|unauthorized|incorrect api key|invalid x-api-key/i.test(m))
    return 'Key rejected by ' + providerName + ' — check the key, then Save again.';
  if (/403|forbidden|permission denied|insufficient/i.test(m))
    return providerName + ' refused this (403) — the key may lack model access or billing.';
  if (/404|no such model|model not found|does not exist|invalid model/i.test(m))
    return 'That model ID doesn\u2019t exist on ' + providerName + ' — hit ⟳ for the live list and pick from it.';
  if (/429|rate.?limit|quota|insufficient_quota|overloaded/i.test(m))
    return 'Rate limited — wait a minute, or switch to a smaller model.';
  if (/failed to fetch|network|econn|enotfound|timeout|abort/i.test(m))
    return 'Can\u2019t reach ' + providerName + ' — offline? Local engines need their server running.';
  return providerName + ' says: ' + raw.slice(0, 220);
}

// Suggest live model IDs when the typed one isn't on the provider.
export function suggestModels(input: string, list: string[], n = 3): string[] {
  const toks = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t && t !== 'batch');
  const q = toks(input);
  if (!q.length) return list.slice(0, n);
  return list
    .map((id) => {
      const t = toks(id);
      let score = 0;
      for (const a of q) for (const b of t) {
        if (a === b) score += 3;
        else if (b.includes(a) || a.includes(b)) score += 1;
      }
      return { id, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map((x) => x.id);
}

// Fetch that routes loopback direct and cloud via the Cudic proxy.
async function routedFetch(url: string, headers: Record<string, string>, body: unknown, signal: AbortSignal): Promise<Response> {
  if (isLoopbackUrl(url)) {
    return fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal });
  }
  if (!supaToken) throw new Error('Sign in on the Cudic site first (cloud models go through your login).');
  return fetch('/api/ai/fetch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + supaToken },
    body: JSON.stringify({ url, method: 'POST', headers, body }),
    signal
  });
}

async function pumpStream(res: Response, format: string, onToken: (t: string) => void, signal: AbortSignal): Promise<string> {
  if (!res.ok) throw new Error(await readError(res));
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let full = '';
  for (;;) {
    if (signal.aborted) { try { await reader.cancel(); } catch { /* noop */ } throw new Error('Stopped.'); }
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      const data = t.slice(5).trim();
      if (data === '[DONE]') continue;
      try {
        const d = deltaOf(format, JSON.parse(data) as Record<string, unknown>);
        if (d) { full += d; onToken(d); }
      } catch { /* keep-alive / comment lines */ }
    }
  }
  return full;
}

export async function streamChat(opts: CallOpts): Promise<string> {
  const base = baseOf(opts.preset, opts.baseOverride);
  const call = buildChat(opts.preset, opts.model, opts.messages, opts.key, base, opts.temperature, opts.maxTokens);
  const res = await routedFetch(call.url, call.headers, call.body, opts.signal);
  return pumpStream(res, opts.preset.format, opts.onToken, opts.signal);
}

export async function fetchModels(preset: ProviderPreset, key: string, baseOverride?: string): Promise<string[]> {
  if (!preset.modelsPath) throw new Error(preset.name + ' has no model list endpoint — type the model ID.');
  const base = baseOf(preset, baseOverride);
  const url = base + preset.modelsPath;
  // Public catalogs go keyless — some reject even an empty Bearer header.
  const headers: Record<string, string> =
    preset.format === 'anthropic'
      ? { ...(key ? { 'x-api-key': key } : {}), 'anthropic-version': '2023-06-01' }
      : key ? { Authorization: 'Bearer ' + key } : {};
  const invoke = async (target: string, h: Record<string, string>): Promise<Response> => {
    if (isLoopbackUrl(target)) return fetch(target, { headers: h });
    if (!supaToken) throw new Error('Sign in on the Cudic site first.');
    return fetch('/api/ai/fetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + supaToken },
      body: JSON.stringify({ url: target, method: 'GET', headers: h })
    });
  };
  const res = await invoke(url, headers);
  if (!res.ok) throw new Error(await readError(res));
  const j = (await res.json()) as Record<string, unknown>;
  const data = (j.data ?? j.models) as Array<Record<string, unknown> | string> | undefined;
  if (!Array.isArray(data)) throw new Error('Unexpected model list shape.');
  // Google returns {models:[{name:'models/gemini-…'}]} — strip the prefix.
  return data
    .map((m) => {
      if (typeof m === 'string') return m;
      const o = m as Record<string, unknown>;
      const raw = String(o.id ?? o.name ?? '');
      return raw.replace(/^models\//, '');
    })
    .filter(Boolean);
}
