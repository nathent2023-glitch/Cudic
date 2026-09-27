// Cudic AI built-in — chat panel mounted straight into the auxiliary bar
// part (right side). This stack ships no WebviewViewPane, so sidebar webview
// views can never render — direct DOM mount instead, the same proven pattern
// as the title-bar Cudic icon. The UI runs in a sandboxed srcdoc iframe;
// all behavior (LLM, files, settings) stays main-side. No vsix, no worker
// main, no extension host involved at all.
declare module '*.html?raw' {
  const s: string;
  export default s;
}

import * as vscode from 'vscode';
import * as monaco from 'monaco-editor';
import {
  registerAction2,
  Action2,
  MenuId
} from '@codingame/monaco-vscode-api/vscode/vs/platform/actions/common/actions';
import {
  Parts,
  setPartVisibility,
  isPartVisibile
} from '@codingame/monaco-vscode-workbench-service-override';
import chatHtmlRaw from './chat.html?raw';
import { PROVIDERS, presetById, ProviderPreset } from './providers';
import { streamChat, fetchModels, setSupaToken, friendlyError, suggestModels, ChatMessage } from './llm';

export { setSupaToken };

export interface AiSettings {
  provider: string;
  model: string;
  baseOverride: string;
  completeOn: boolean;
  completeModel: string;
  keys: Record<string, string>;
  modelLists: Record<string, string[]>;
}

const STORE_KEY = 'cudic-ai';
const TEXT_EXT = /\.(html|css|js|ts|tsx|jsx|json|md|txt|svg|xml)$/i;

function loadSettings(): AiSettings {
  const d: AiSettings = { provider: 'zen', model: '', baseOverride: '', completeOn: true, completeModel: '', keys: {}, modelLists: {} };
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return { ...d, ...(JSON.parse(raw) as Partial<AiSettings>) };
  } catch { /* private mode */ }
  return d;
}
function saveSettings(s: AiSettings): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(s));
  } catch { /* private mode */ }
}
function publicSettings(s: AiSettings) {
  return {
    provider: s.provider, model: s.model, baseOverride: s.baseOverride,
    completeOn: s.completeOn, completeModel: s.completeModel,
    hasKey: !!(s.keys[s.provider] || presetById(s.provider).keyOptional),
    // Presence only (never values) so the list screen knows which
    // companies can load their full catalog.
    keyed: Object.keys(s.keys).filter((k) => !!s.keys[k])
  };
}

function nonce(): string {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function gatherContext(attachActive: boolean): Promise<{ tree: string; activePath: string | null; activeText: string; selection: string }> {
  let activePath: string | null = null, activeText = '', selection = '';
  try {
    const ed = vscode.window.activeTextEditor;
    if (attachActive && ed && ed.document.uri.scheme === 'file' && TEXT_EXT.test(ed.document.uri.path)) {
      activePath = ed.document.uri.path;
      activeText = ed.document.getText().slice(0, 12000);
      if (!ed.selection.isEmpty) selection = ed.document.getText(ed.selection).slice(0, 4000);
    }
  } catch { /* no editor */ }
  let tree = '';
  try {
    const files = await vscode.workspace.findFiles('**/*', '**/{node_modules,.git}/**', 300);
    tree = files.map((u) => u.path).filter((p) => TEXT_EXT.test(p)).slice(0, 120).join('\n');
  } catch {
    try {
      tree = vscode.workspace.textDocuments.map((d) => d.uri.path).filter((p) => TEXT_EXT.test(p)).join('\n');
    } catch { /* empty */ }
  }
  return { tree, activePath, activeText, selection };
}

function systemPrompt(ctx: { tree: string; activePath: string | null; activeText: string; selection: string }): string {
  let s = 'You are Cudic AI, a coding assistant inside Cudic Studio (a browser VS Code for small web games). Be concise. ';
  s += 'When you provide a complete file, open its fence as ```lang:/workspace/path so the user can Apply it.';
  if (ctx.tree) s += '\n\nProject files:\n' + ctx.tree;
  if (ctx.activePath) s += '\n\nActive file ' + ctx.activePath + ':\n```\n' + ctx.activeText + '\n```';
  if (ctx.selection) s += '\n\nUser selection:\n```\n' + ctx.selection + '\n```';
  return s;
}

function normalizeApplyPath(p: string): string | null {
  const clean = p.trim().replace(/^\/+/, '').replace(/^workspace\//i, '');
  if (!clean || clean.includes('..') || !TEXT_EXT.test(clean)) return null;
  return '/workspace/' + clean;
}

let panelEl: HTMLElement | null = null;
let iframeEl: HTMLIFrameElement | null = null;

function postToPanel(m: unknown): void {
  try {
    iframeEl?.contentWindow?.postMessage(m, '*');
  } catch { /* panel hidden */ }
}

async function handlePanelMessage(m: Record<string, unknown>): Promise<void> {
  const st = loadSettings();
  const preset: ProviderPreset = presetById(st.provider);
  const key = st.keys[st.provider] ?? '';
  if (m.type === 'ai:ready') {
    postToPanel({ type: 'ai:init', presets: PROVIDERS, settings: publicSettings(st) });
    return;
  }
  if (m.type === 'ai:saveSettings') {
    const next: AiSettings = {
      provider: String(m.provider || 'zen'),
      model: String(m.model || ''),
      baseOverride: String(m.baseOverride || ''),
      completeOn: m.completeOn !== false,
      completeModel: String(m.completeModel || ''),
      keys: { ...st.keys }
    };
    if (typeof m.key === 'string' && m.key) next.keys[next.provider] = m.key;
    saveSettings(next);
    postToPanel({ type: 'ai:state', settings: publicSettings(next) });
    return;
  }
  if (m.type === 'ai:models') {
    // Optional provider override lets the list screen load another
    // company's lineup without switching the active provider.
    const pid = typeof m.provider === 'string' && m.provider ? m.provider : st.provider;
    const target = presetById(pid);
    const tkey = (st.keys[pid] ?? '');
    try {
      const models = await fetchModels(target, tkey, pid === st.provider ? st.baseOverride || undefined : undefined);
      const next = loadSettings();
      next.modelLists = { ...next.modelLists, [pid]: models.slice(0, 500) };
      saveSettings(next);
      postToPanel({ type: 'ai:modelsResult', provider: pid, models });
    } catch (e) {
      postToPanel({ type: 'ai:modelsResult', provider: pid, error: friendlyError(target.name, (e as Error).message) });
    }
    return;
  }
  // Resolve the model, validating against the last live list so a stale or
  // typo'd ID fails here with suggestions instead of a doomed request.
  function resolveModel(): string {
    const typed = st.model.trim() || preset.models[0] || '';
    const list = st.modelLists[st.provider];
    if (typed && list && list.length && !list.includes(typed)) {
      const sug = suggestModels(typed, list);
      throw new Error(
        '\u201C' + typed + '\u201D isn\u2019t on ' + preset.name +
        (sug.length ? ' — did you mean ' + sug.join(', ') + '?' : ' — hit \u27F3 for the live list.')
      );
    }
    return typed;
  }
  if (m.type === 'ai:test') {
    try {
      const ctl = new AbortController();
      const text = await streamChat({
        preset, baseOverride: st.baseOverride || undefined, key,
        model: resolveModel(),
        messages: [{ role: 'user', content: 'Reply with exactly: ok' }],
        signal: ctl.signal, onToken: () => undefined, temperature: 0, maxTokens: 8
      });
      postToPanel({ type: 'ai:testResult', ok: true, text: text.trim().slice(0, 60) });
    } catch (e) {
      postToPanel({ type: 'ai:testResult', ok: false, error: friendlyError(preset.name, (e as Error).message) });
    }
    return;
  }
  if (m.type === 'ai:chat') {
    const id = String(m.id);
    const ctl = new AbortController();
    controllers.set(id, ctl);
    try {
      const model = resolveModel();
      const ctx = await gatherContext(m.attachActive !== false);
      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt(ctx) },
        { role: 'user', content: String(m.text || '') }
      ];
      await streamChat({
        preset, baseOverride: st.baseOverride || undefined, key,
        model,
        messages, signal: ctl.signal,
        onToken: (t) => postToPanel({ type: 'ai:chunk', id, token: t })
      });
      postToPanel({ type: 'ai:done', id, q: String(m.text || '') });
    } catch (e) {
      postToPanel({ type: 'ai:error', id, error: friendlyError(preset.name, (e as Error).message) });
    } finally {
      controllers.delete(id);
    }
    return;
  }
  if (m.type === 'ai:stop') {
    controllers.get(String(m.id))?.abort();
    return;
  }
  if (m.type === 'ai:apply') {
    const target = normalizeApplyPath(String(m.path || ''));
    if (!target) {
      postToPanel({ type: 'ai:applied', path: String(m.path || ''), ok: false, error: 'Unsafe or unknown path.' });
      return;
    }
    try {
      await vscode.workspace.fs.writeFile(vscode.Uri.file(target), new TextEncoder().encode(String(m.content ?? '')));
      void vscode.window.showInformationMessage('Cudic AI wrote ' + target);
      postToPanel({ type: 'ai:applied', path: target, ok: true });
    } catch (e) {
      postToPanel({ type: 'ai:applied', path: target, ok: false, error: (e as Error).message });
    }
  }
}
const controllers = new Map<string, AbortController>();

function showPanel(): void {
  if (!panelEl) return;
  try {
    setPartVisibility(Parts.AUXILIARYBAR_PART, true);
  } catch { /* part api hiccup */ }
  panelEl.style.display = 'flex';
}

function hidePanel(): void {
  if (panelEl) panelEl.style.display = 'none';
}

function el(html: string): HTMLElement {
  const t = document.createElement('template');
  t.innerHTML = html;
  return t.content.firstElementChild as HTMLElement;
}

// Mounts the chat panel as an overlay filling the auxiliary bar part.
// Called with the workbench shadow root; retries until the part exists.
export function registerCudicAi(shadowRoot: ShadowRoot): void {
  const mount = (): boolean => {
    const part = shadowRoot.querySelector('.part.auxiliarybar') as HTMLElement | null;
    if (!part) return false;
    if (!panelEl) {
      if (getComputedStyle(part).position === 'static') part.style.position = 'relative';
      panelEl = el(
        '<div id="cudic-ai-panel" style="position:absolute;inset:0;display:none;flex-direction:column;' +
        'background:var(--vscode-sideBar-background,#181818);color:var(--vscode-foreground,#dbe4ff);' +
        'font-family:var(--vscode-font-family,sans-serif);font-size:13px;z-index:5;"></div>'
      );
      const bar = el(
        '<div style="display:flex;align-items:center;gap:8px;padding:8px 10px 8px 14px;font-size:11px;' +
        'font-weight:700;letter-spacing:.08em;border-bottom:1px solid var(--vscode-sideBarSectionHeader-border,#2d2d2d);">' +
        '<span>✦ CUDIC AI</span><span style="flex:1"></span></div>'
      );
      const hide = el(
        '<button title="Hide panel" style="background:transparent;border:none;cursor:pointer;font-size:15px;' +
        'color:inherit;opacity:.7;padding:2px 6px;">×</button>'
      );
      hide.addEventListener('click', hidePanel);
      bar.append(hide);
      iframeEl = document.createElement('iframe');
      iframeEl.setAttribute('sandbox', 'allow-scripts');
      iframeEl.setAttribute('title', 'Cudic AI chat');
      iframeEl.style.cssText = 'flex:1;border:none;width:100%;min-height:0;background:transparent;';
      iframeEl.srcdoc = chatHtmlRaw.replaceAll('__NONCE__', nonce());
      panelEl.append(bar, iframeEl);
      part.appendChild(panelEl);
      window.addEventListener('message', (e: MessageEvent) => {
        if (e.source !== iframeEl?.contentWindow) return;
        void handlePanelMessage((e.data || {}) as Record<string, unknown>);
      });
      // Title-bar sparkle toggle next to the Cudic cube (same pattern).
      const cube = shadowRoot.querySelector('#glox-title-icon');
      if (cube?.parentElement) {
        const spark = el(
          '<button title="Cudic AI" aria-label="Cudic AI" style="display:flex;align-items:center;' +
          'justify-content:center;width:28px;height:24px;background:transparent;border:none;cursor:pointer;' +
          'padding:0;margin-right:2px;flex:0 0 auto;color:var(--vscode-foreground,#dbe4ff);font-size:15px;">✦</button>'
        );
        spark.addEventListener('click', () => {
          if (panelEl && panelEl.style.display !== 'none' && isPartVisibile(Parts.AUXILIARYBAR_PART)) hidePanel();
          else showPanel();
        });
        cube.parentElement.insertBefore(spark, cube.nextSibling);
      }
    }
    return true;
  };
  if (!mount()) {
    const timer = setInterval(() => {
      if (mount()) clearInterval(timer);
    }, 500);
    setTimeout(() => clearInterval(timer), 10000);
  }

  registerAction2(
    class extends Action2 {
      constructor() {
        super({
          id: 'cudic-ai.openChat',
          title: { value: 'Cudic AI: Open chat', original: 'Cudic AI: Open chat' },
          menu: [{ id: MenuId.CommandPalette }]
        });
      }
      async run(): Promise<void> {
        mount();
        showPanel();
      }
    }
  );

  // Ghost autocomplete — same provider brain, Tab to accept. Monaco-level
  // API (not the vscode layer) so it works in every workbench editor.
  let runSerial = 0;
  monaco.languages.registerInlineCompletionsProvider(
    { scheme: 'file', pattern: '**' },
    {
      async provideInlineCompletions(model, position, _context, token) {
        const st = loadSettings();
        if (!st.completeOn) return;
        if (!TEXT_EXT.test(model.uri.path)) return;
        const preset = presetById(st.provider);
        const key = st.keys[st.provider] ?? '';
        const cmodel = st.completeModel.trim() || st.model.trim();
        if (!cmodel || (!key && !preset.keyOptional)) return;
        const text = model.getValue();
        const offset = model.getOffsetAt(position);
        if (offset < 25 || token.isCancellationRequested) return;
        const myRun = ++runSerial;
        await new Promise((r) => setTimeout(r, 450));
        if (myRun !== runSerial || token.isCancellationRequested) return;
        const prefix = text.slice(Math.max(0, offset - 1500), offset);
        if (prefix.trim().length < 10) return;
        const suffix = text.slice(offset, offset + 500);
        try {
          const ctl = new AbortController();
          const sub = token.onCancellationRequested(() => ctl.abort());
          const out = await streamChat({
            preset, baseOverride: st.baseOverride || undefined, key, model: cmodel,
            messages: [
              { role: 'system', content: 'You are a code completion engine. Output ONLY the code that continues at <CURSOR>. No fences, no explanations, no repetition of existing code.' },
              { role: 'user', content: '```\n' + prefix + '⟦CURSOR⟧' + suffix + '\n```' }
            ],
            signal: ctl.signal, onToken: () => undefined, temperature: 0, maxTokens: 96
          });
          sub.dispose();
          let insert = out.replace(/^```\w*\n?/, '').replace(/\n?```$/, '').replace(/\s+$/, '');
          if (!insert) return;
          // Don't suggest what's already typed ahead.
          if (suffix.trimStart().startsWith(insert.trim()) && insert.trim()) return;
          return { items: [{ insertText: insert, range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column) }] };
        } catch {
          return;
        }
      }
    }
  );
}
