// Cudic AI provider registry — ~50 presets over 3 wire formats.
// OpenAI-compatible chat completions covers nearly everything; Anthropic and
// Gemini need their native shapes. Model IDs drift — every preset allows
// free-text IDs and (where supported) a live /models fetch.
export type WireFormat = 'openai-chat' | 'anthropic' | 'gemini';

export interface ProviderPreset {
  id: string;
  name: string;
  // Base URL for the wire format (chat-completions root). Anthropic appends
  // /messages, Gemini appends /models/{model}:streamGenerateContent.
  base: string;
  format: WireFormat;
  keyLabel: string;
  keyHelp: string;
  models: string[];
  // Local engines: called direct from the browser, never proxied, no key.
  loopback?: boolean;
  keyOptional?: boolean;
  // GET {base}{modelsPath} returns an OpenAI-style {data:[{id}]} list.
  modelsPath?: string | null;
  // Model list is public (no key needed) — safe to auto-fetch.
  publicModels?: boolean;
  extraQuery?: Record<string, string>;
  note?: string;
}

const OAI = 'openai-chat';

export const PROVIDERS: ProviderPreset[] = [
  { id: 'zen', name: 'OpenCode Zen', base: 'https://opencode.ai/zen/v1', format: OAI, keyLabel: 'Zen API key', keyHelp: 'Sign in at opencode.ai/zen, copy your key. Free models included.', models: ['big-pickle', 'mimo-v2.5-free', 'nemotron-3-ultra-free', 'nemotron-3.5-lightning-free', 'ling-3.0-flash-fin-free', 'muse-spark-1.3-contributor-free', 'deepseek-v4-flash-free', 'minimax-m3-free', 'qwen3.6-plus-free', 'kimi-k2.7-code', 'glm-5', 'deepseek-v4-pro'], modelsPath: '/models', publicModels: true, note: 'Free promo models rotate. Card on file may be required.' },
  { id: 'openrouter', name: 'OpenRouter (200+ models)', base: 'https://openrouter.ai/api/v1', format: OAI, keyLabel: 'OpenRouter key', keyHelp: 'One key, every major model. Free variants exist.', models: ['x-ai/grok-4.6', 'google/gemini-3.8-flash', 'moonshotai/kimi-k2.7-code', 'deepseek/deepseek-v4.1-flash', 'meta-llama/llama-3.3-70b-instruct', 'anthropic/claude-opus-5'], modelsPath: '/models', publicModels: true },
  { id: 'openai', name: 'OpenAI', base: 'https://api.openai.com/v1', format: OAI, keyLabel: 'OpenAI API key', keyHelp: 'platform.openai.com → API keys.', models: ['gpt-5.5', 'gpt-5.5-mini', 'gpt-5.4'], modelsPath: '/models' },
  { id: 'anthropic', name: 'Anthropic', base: 'https://api.anthropic.com', format: 'anthropic', keyLabel: 'Anthropic API key', keyHelp: 'console.anthropic.com → API keys.', models: ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-opus-4-5', 'claude-sonnet-4-5', 'claude-haiku-4-5'], modelsPath: null, note: 'Anthropic publishes no model list, so these are curated.' },
  { id: 'gemini', name: 'Google Gemini', base: 'https://generativelanguage.googleapis.com/v1beta', format: 'gemini', keyLabel: 'Gemini API key', keyHelp: 'Google AI Studio → Get API key. Free tier available.', models: ['gemini-3.1-pro', 'gemini-3-flash'], modelsPath: '/models' },
  { id: 'xai', name: 'xAI Grok', base: 'https://api.x.ai/v1', format: OAI, keyLabel: 'xAI API key', keyHelp: 'console.x.ai → API keys.', models: ['grok-4.6', 'grok-4.6-mini'], modelsPath: '/models' },
  { id: 'deepseek', name: 'DeepSeek', base: 'https://api.deepseek.com', format: OAI, keyLabel: 'DeepSeek API key', keyHelp: 'platform.deepseek.com → API keys.', models: ['deepseek-chat', 'deepseek-reasoner'], modelsPath: '/models' },
  { id: 'mistral', name: 'Mistral', base: 'https://api.mistral.ai/v1', format: OAI, keyLabel: 'Mistral API key', keyHelp: 'console.mistral.ai → API keys.', models: ['mistral-large-latest', 'mistral-medium-latest', 'codestral-latest', 'mistral-small-latest'], modelsPath: '/models' },
  { id: 'groq', name: 'Groq (fast)', base: 'https://api.groq.com/openai/v1', format: OAI, keyLabel: 'Groq API key', keyHelp: 'console.groq.com → API keys. Generous free tier.', models: ['llama-3.3-70b-versatile', 'moonshotai/kimi-k2-instruct'], modelsPath: '/models' },
  { id: 'together', name: 'Together AI', base: 'https://api.together.xyz/v1', format: OAI, keyLabel: 'Together API key', keyHelp: 'api.together.ai → API keys.', models: ['meta-llama/Llama-3.3-70B-Instruct-Turbo', 'deepseek-ai/DeepSeek-V3'], modelsPath: '/models' },
  { id: 'fireworks', name: 'Fireworks AI', base: 'https://api.fireworks.ai/inference/v1', format: OAI, keyLabel: 'Fireworks API key', keyHelp: 'fireworks.ai → API keys. Use full model IDs.', models: ['accounts/fireworks/models/llama-v3p3-70b-instruct'], modelsPath: '/models' },
  { id: 'cerebras', name: 'Cerebras (fast)', base: 'https://api.cerebras.ai/v1', format: OAI, keyLabel: 'Cerebras API key', keyHelp: 'cloud.cerebras.ai → API keys. Free tier available.', models: ['llama-3.3-70b', 'llama-3.1-8b'], modelsPath: '/models' },
  { id: 'deepinfra', name: 'DeepInfra', base: 'https://api.deepinfra.com/v1/openai', format: OAI, keyLabel: 'DeepInfra token', keyHelp: 'deepinfra.com → API tokens.', models: ['meta-llama/Meta-Llama-3.1-70B-Instruct', 'Qwen/Qwen2.5-72B-Instruct'], modelsPath: '/models' },
  { id: 'cohere', name: 'Cohere', base: 'https://api.cohere.com/compatibility/v1', format: OAI, keyLabel: 'Cohere API key', keyHelp: 'dashboard.cohere.com → API keys.', models: ['command-a-03-2025'], modelsPath: '/models' },
  { id: 'perplexity', name: 'Perplexity', base: 'https://api.perplexity.ai', format: OAI, keyLabel: 'Perplexity API key', keyHelp: 'docs.perplexity.ai → API keys.', models: ['sonar', 'sonar-pro'], modelsPath: null },
  { id: 'minimax', name: 'MiniMax', base: 'https://api.minimax.io/v1', format: OAI, keyLabel: 'MiniMax API key', keyHelp: 'platform.minimaxi.com → API keys.', models: ['MiniMax-M2.5'], modelsPath: null },
  { id: 'moonshot', name: 'Moonshot (Kimi)', base: 'https://api.moonshot.ai/v1', format: OAI, keyLabel: 'Moonshot API key', keyHelp: 'platform.moonshot.ai → API keys.', models: ['kimi-k2.5', 'kimi-k3'], modelsPath: '/models' },
  { id: 'zhipu', name: 'Zhipu (GLM)', base: 'https://api.zhipu.ai/api/paas/v4/', format: OAI, keyLabel: 'Zhipu API key', keyHelp: 'open.bigmodel.cn → API keys.', models: ['glm-4.5', 'glm-4.5-air'], modelsPath: null },
  { id: 'qwen', name: 'Alibaba Qwen', base: 'https://dashscope.aliyuncs.com/compatible-mode/v1', format: OAI, keyLabel: 'DashScope API key', keyHelp: 'bailian.console.aliyun.com → API keys.', models: ['qwen-max', 'qwen-plus', 'qwen-turbo'], modelsPath: '/models' },
  { id: 'doubao', name: 'Volcengine Doubao', base: 'https://ark.cn-beijing.volces.com/api/v3', format: OAI, keyLabel: 'ARK API key', keyHelp: 'Volcengine ARK. Model = your endpoint ID.', models: [], modelsPath: null, note: 'Model field takes your inference endpoint ID.' },
  { id: 'stepfun', name: 'StepFun', base: 'https://api.stepfun.com/v1', format: OAI, keyLabel: 'StepFun API key', keyHelp: 'platform.stepfun.com → API keys.', models: ['step-2-mini'], modelsPath: '/models' },
  { id: '01ai', name: '01.AI (Yi)', base: 'https://api.01.ai/v1', format: OAI, keyLabel: '01.AI API key', keyHelp: 'platform.01.ai → API keys.', models: ['yi-lightning'], modelsPath: '/models' },
  { id: 'sarvam', name: 'Sarvam', base: 'https://api.sarvam.ai/v1', format: OAI, keyLabel: 'Sarvam API key', keyHelp: 'dashboard.sarvam.ai → API keys.', models: ['sarvam-m'], modelsPath: null },
  { id: 'upstage', name: 'Upstage Solar', base: 'https://api.upstage.ai/v1/solar', format: OAI, keyLabel: 'Upstage API key', keyHelp: 'console.upstage.ai → API keys.', models: ['solar-pro', 'solar-mini'], modelsPath: '/models' },
  { id: 'ai21', name: 'AI21 (Jamba)', base: 'https://api.ai21.com/studio/v1', format: OAI, keyLabel: 'AI21 API key', keyHelp: 'studio.ai21.com → API keys.', models: ['jamba-large', 'jamba-mini'], modelsPath: null },
  { id: 'writer', name: 'Writer (Palmyra)', base: 'https://api.writer.com/v1', format: OAI, keyLabel: 'Writer API key', keyHelp: 'dev.writer.com → API keys.', models: [], modelsPath: null },
  { id: 'hyperbolic', name: 'Hyperbolic', base: 'https://api.hyperbolic.xyz/v1', format: OAI, keyLabel: 'Hyperbolic API key', keyHelp: 'app.hyperbolic.xyz → API keys.', models: ['meta-llama/Meta-Llama-3.1-70B-Instruct'], modelsPath: '/models' },
  { id: 'nebius', name: 'Nebius', base: 'https://api.studio.nebius.com/v1', format: OAI, keyLabel: 'Nebius API key', keyHelp: 'studio.nebius.com → API keys.', models: ['meta-llama/Meta-Llama-3.1-70B-Instruct', 'Qwen/Qwen2.5-72B-Instruct'], modelsPath: '/models' },
  { id: 'sambanova', name: 'SambaNova', base: 'https://api.sambanova.ai/v1', format: OAI, keyLabel: 'SambaNova key', keyHelp: 'cloud.sambanova.ai → API keys. Free tier available.', models: ['Meta-Llama-3.3-70B-Instruct'], modelsPath: '/models' },
  { id: 'novita', name: 'Novita', base: 'https://api.novita.ai/openai', format: OAI, keyLabel: 'Novita API key', keyHelp: 'novita.ai → API keys.', models: ['deepseek/deepseek-v3-0324'], modelsPath: '/models' },
  { id: 'siliconflow', name: 'SiliconFlow', base: 'https://api.siliconflow.cn/v1', format: OAI, keyLabel: 'SiliconFlow key', keyHelp: 'cloud.siliconflow.cn → API keys.', models: ['Qwen/Qwen2.5-72B-Instruct', 'deepseek-ai/DeepSeek-V3'], modelsPath: '/models' },
  { id: 'infermatic', name: 'Infermatic', base: 'https://api.infermatic.ai/v1', format: OAI, keyLabel: 'Infermatic key', keyHelp: 'infermatic.ai → API keys.', models: ['meta-llama/llama-3.3-70b-instruct-fp8'], modelsPath: '/models' },
  { id: 'kluster', name: 'Kluster.ai', base: 'https://api.kluster.ai/v1', format: OAI, keyLabel: 'Kluster API key', keyHelp: 'platform.kluster.ai → API keys.', models: ['klusterai/Meta-Llama-3.3-70B-Instruct-Turbo'], modelsPath: '/models' },
  { id: 'chutes', name: 'Chutes', base: 'https://llm.chutes.ai/v1', format: OAI, keyLabel: 'Chutes token', keyHelp: 'chutes.ai → API keys.', models: ['deepseek-ai/DeepSeek-V3-0324'], modelsPath: '/models' },
  { id: 'featherless', name: 'Featherless', base: 'https://api.featherless.ai/v1', format: OAI, keyLabel: 'Featherless key', keyHelp: 'featherless.ai → API keys.', models: ['meta-llama/Meta-Llama-3.1-405B-Instruct'], modelsPath: '/models' },
  { id: 'targon', name: 'Targon', base: 'https://api.targon.com/v1', format: OAI, keyLabel: 'Targon API key', keyHelp: 'targon.com → API keys.', models: ['meta-llama/Llama-3.3-70B-Instruct'], modelsPath: '/models' },
  { id: 'friendli', name: 'FriendliAI', base: 'https://api.friendli.ai/v1', format: OAI, keyLabel: 'Friendli token', keyHelp: 'friendli.ai → API tokens.', models: ['meta-llama-3.1-70b-instruct'], modelsPath: '/models' },
  { id: 'nscale', name: 'Nscale', base: 'https://api.nscale.com/v1', format: OAI, keyLabel: 'Nscale API key', keyHelp: 'nscale.com → API keys.', models: ['meta-llama/Llama-3.3-70B-Instruct'], modelsPath: null },
  { id: 'parasail', name: 'Parasail', base: 'https://api.parasail.io/v1', format: OAI, keyLabel: 'Parasail API key', keyHelp: 'parasail.io → API keys.', models: ['qwen-2.5-72b'], modelsPath: '/models' },
  { id: 'lambda', name: 'Lambda', base: 'https://api.lambda.ai/v1', format: OAI, keyLabel: 'Lambda API key', keyHelp: 'cloud.lambda.ai → API keys.', models: ['llama-3.3-70b-instruct-fp8'], modelsPath: '/models' },
  { id: 'anyscale', name: 'Anyscale', base: 'https://api.endpoints.anyscale.com/v1', format: OAI, keyLabel: 'Anyscale token', keyHelp: 'app.endpoints.anyscale.com → credentials.', models: ['mistralai/Mixtral-8x7B-Instruct-v0.1'], modelsPath: '/models' },
  { id: 'baseten', name: 'Baseten', base: 'https://api.baseten.co/v1', format: OAI, keyLabel: 'Baseten API key', keyHelp: 'app.baseten.co → API keys. Model = your deployment ID.', models: [], modelsPath: null, note: 'Model field takes your deployment ID.' },
  { id: 'cloudflare', name: 'Cloudflare Workers AI', base: 'https://api.cloudflare.com/client/v4/accounts/{account}/ai/v1', format: OAI, keyLabel: 'Cloudflare API token', keyHelp: 'dash.cloudflare.com → API tokens. Replace {account} with your account ID.', models: ['@cf/meta/llama-3.1-8b-instruct', '@cf/mistral/mistral-7b-instruct-v0.1'], modelsPath: null },
  { id: 'venice', name: 'Venice (private)', base: 'https://api.venice.ai/api/v1', format: OAI, keyLabel: 'Venice API key', keyHelp: 'venice.ai → API keys. No data retention.', models: ['dolphin-2.9.2-qwen2-72b'], modelsPath: '/models' },
  { id: 'z-ai', name: 'Z.AI (GLM coding)', base: 'https://api.z.ai/api/paas/v4/', format: OAI, keyLabel: 'Z.AI API key', keyHelp: 'z.ai → API keys.', models: ['glm-4.5'], modelsPath: null },
  { id: 'hunyuan', name: 'Tencent Hunyuan', base: 'https://api.hunyuan.cloud.tencent.com/v1', format: OAI, keyLabel: 'Hunyuan API key', keyHelp: 'cloud.tencent.com → API keys.', models: ['hunyuan-turbos-latest'], modelsPath: null },
  { id: 'qianfan', name: 'Baidu Qianfan', base: 'https://qianfan.baidubce.com/v2', format: OAI, keyLabel: 'Qianfan access key', keyHelp: 'qianfan.cloud.baidu.com → API keys.', models: ['ernie-4.5-turbo'], modelsPath: null },
  { id: 'aimlapi', name: 'AI/ML API', base: 'https://api.aimlapi.com/v1', format: OAI, keyLabel: 'AI/ML API key', keyHelp: 'aimlapi.com → API keys.', models: ['openai/gpt-4o-mini'], modelsPath: '/models' },
  { id: 'zeroone', name: '01.AI (Yi)', base: 'https://api.zeroone.ai/v1', format: OAI, keyLabel: '01.AI API key', keyHelp: 'See 01.AI entry. Alias host.', models: ['yi-lightning'], modelsPath: '/models' },
  { id: 'ollama', name: 'Ollama (local, free)', base: 'http://localhost:11434/v1', format: OAI, keyLabel: '', keyHelp: 'No key. Run `ollama serve` + pull a model. Set OLLAMA_ORIGINS=http://localhost:3000.', models: ['llama3.1', 'qwen2.5-coder', 'deepseek-r1'], modelsPath: '/models', loopback: true, keyOptional: true },
  { id: 'lmstudio', name: 'LM Studio (local, free)', base: 'http://localhost:1234/v1', format: OAI, keyLabel: '', keyHelp: 'No key. Load a model in LM Studio and start its server.', models: [], modelsPath: '/models', loopback: true, keyOptional: true },
  { id: 'azure', name: 'Azure OpenAI', base: 'https://{resource}.openai.azure.com/openai/deployments/{deployment}', format: OAI, keyLabel: 'Azure API key', keyHelp: 'Replace {resource} and {deployment} in the URL above.', models: [], modelsPath: null, extraQuery: { 'api-version': '2024-12-01-preview' } },
  { id: 'custom', name: 'Custom endpoint', base: '', format: OAI, keyLabel: 'API key (if needed)', keyHelp: 'Any OpenAI-compatible /chat/completions URL.', models: [], modelsPath: '/models', keyOptional: true, note: 'Paste the full base URL, e.g. https://my-host/v1' }
];

export function presetById(id: string): ProviderPreset {
  return PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0];
}

// Loopback / private targets always go direct from the browser —
// the proxy refuses them, and the server could never reach them anyway.
export function isLoopbackUrl(u: string): boolean {
  try {
    const h = new URL(u).hostname;
    return /^(localhost|127\.|0\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$|.*\.local$)/i.test(h);
  } catch {
    return true;
  }
}
