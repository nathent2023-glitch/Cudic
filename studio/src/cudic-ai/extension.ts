// Cudic AI built-in — chat panel mounted straight into the bottom panel
// part. This stack ships no WebviewViewPane, so sidebar webview
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
// Terminal base layer (MIT, vendored inline): type scale + form rhythm for
// the panel's terminal skin. Our rules come after it in chat.html and win.
import terminalCss from 'terminal.css/dist/terminal.min.css?raw';
import { PROVIDERS, presetById, ProviderPreset } from './providers';
import { streamChat, fetchModels, friendlyError, suggestModels, ChatMessage, ToolDef, ToolCall, setSupaToken as setLlmToken } from './llm';
import { SKILLS } from './skills';

// main.ts calls this on boot + every 60s. Forwards the token to llm.ts and
// tells the panel whether a login exists, so /status and the status line
// can say so instead of failing at send time.
let lastSupa: string | null = null;
export function setSupaToken(t: string | null): void {
  lastSupa = t;
  setLlmToken(t);
  postToPanel({ type: 'ai:supa', ok: !!t });
}

export interface AiSettings {
  provider: string;
  model: string;
  baseOverride: string;
  completeOn: boolean;
  completeModel: string;
  keys: Record<string, string>;
  modelLists: Record<string, string[]>;
  fetchedAt: Record<string, number>;
  // Selected premade skill ids appended to the system prompt.
  skills: string[];
}

const STORE_KEY = 'cudic-ai';
const TEXT_EXT = /\.(html|css|js|ts|tsx|jsx|json|md|txt|svg|xml)$/i;

function loadSettings(): AiSettings {
  const d: AiSettings = { provider: 'zen', model: '', baseOverride: '', completeOn: true, completeModel: '', keys: {}, modelLists: {}, fetchedAt: {}, skills: ['cudic'] };
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
    skills: s.skills,
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

function systemPrompt(
  ctx: { tree: string; activePath: string | null; activeText: string; selection: string },
  skillIds: string[],
  withTools: boolean
): string {
  let s = 'You are Cudic AI, a coding assistant inside Cudic Studio (a browser VS Code for small web games). Be concise. ';
  s += 'When you provide a complete file, open its fence as ```lang:/workspace/path so the user can Apply it.';
  if (withTools) {
    s += '\n\nTools you can call on the open project:\n' +
      '- save_file(path, content): create or overwrite a project file (path is project-root relative, e.g. index.html or src/game.js). When the user asks you to create, edit, or save files, call it with the complete new file content instead of only showing code, then reply briefly with what you saved.\n' +
      '- read_file(path): inspect any project file, not just the attached active file.\n' +
      'After writing files, tell the user to save their project. Use fences when the user wants to review before applying.';
  }
  for (const id of skillIds) {
    const sk = SKILLS.find((x) => x.id === id);
    if (sk) s += '\n\n' + sk.text;
  }
  if (ctx.tree) s += '\n\nProject files:\n' + ctx.tree;
  if (ctx.activePath) s += '\n\nActive file ' + ctx.activePath + ':\n```\n' + ctx.activeText + '\n```';
  if (ctx.selection) s += '\n\nUser selection:\n```\n' + ctx.selection + '\n```';
  return s;
}

// Tools the chat can invoke directly. Paths go through the same
// normalizeApplyPath guard as the Apply button.
const TOOL_DEFS: ToolDef[] = [
  {
    name: 'save_file',
    description: 'Create or overwrite a file in the open project. Path is project-root relative.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Project-relative path, e.g. index.html or src/game.js' },
        content: { type: 'string', description: 'The complete new file content' }
      },
      required: ['path', 'content']
    }
  },
  {
    name: 'read_file',
    description: 'Read a text file from the open project to inspect its current contents.',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Project-relative path' } },
      required: ['path']
    }
  }
];

// Prefix/suffix hunk diff for tool cards: the changed middle rendered as
// -/＋ lines with counts. Bounded so a full-file rewrite can't flood chat.
function hunkDiff(before: string, after: string, cap = 40): { added: number; removed: number; text: string } {
  const a = before.split('\n');
  const b = after.split('\n');
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  let suf = 0;
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
  const del = a.slice(pre, a.length - suf);
  const ins = b.slice(pre, b.length - suf);
  const lines: string[] = [];
  for (const l of del) {
    if (lines.length >= cap) break;
    lines.push('-' + l);
  }
  for (const l of ins) {
    if (lines.length >= cap) break;
    lines.push('+' + l);
  }
  let text = lines.join('\n');
  if (del.length + ins.length > lines.length) {
    text += '\n… (' + (del.length + ins.length - lines.length) + ' more lines)';
  }
  return { added: ins.length, removed: del.length, text };
}

async function runTool(call: ToolCall): Promise<{ ok: boolean; summary: string; payload: string; diff?: string; added?: number; removed?: number }> {
  try {
    const args = JSON.parse(call.args || '{}') as Record<string, unknown>;
    const target = normalizeApplyPath(String(args.path ?? ''));
    if (!target) {
      const p = String(args.path ?? '');
      return { ok: false, summary: 'unsafe or unsupported path "' + p + '"', payload: JSON.stringify({ error: 'Unsafe or unsupported path: ' + p }) };
    }
    const rel = target.replace(/^\/workspace\//, '');
    if (call.name === 'save_file') {
      const next = String(args.content ?? '');
      let before = '';
      try {
        before = new TextDecoder().decode(await vscode.workspace.fs.readFile(vscode.Uri.file(target)));
      } catch {
        // New file: everything counts as added.
      }
      await vscode.workspace.fs.writeFile(vscode.Uri.file(target), new TextEncoder().encode(next));
      const d = hunkDiff(before, next);
      const stat = before === next ? ' (no changes)' : ' (+' + d.added + ' −' + d.removed + ')';
      return { ok: true, summary: 'saved ' + rel + stat, payload: JSON.stringify({ ok: true, path: rel }), diff: d.text, added: d.added, removed: d.removed };
    }
    if (call.name === 'read_file') {
      const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(target));
      const text = new TextDecoder().decode(bytes).slice(0, 30000);
      return { ok: true, summary: 'read ' + rel, payload: JSON.stringify({ path: rel, content: text }) };
    }
    return { ok: false, summary: 'unknown tool ' + call.name, payload: JSON.stringify({ error: 'Unknown tool: ' + call.name }) };
  } catch (e) {
    const msg = (e as Error).message || String(e);
    return { ok: false, summary: msg.slice(0, 120), payload: JSON.stringify({ error: msg }) };
  }
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

// Model catalogs older than this refetch in the background (see ai:ready).
const MODEL_LIST_TTL = 24 * 3600 * 1000;

async function refreshModels(pid: string, st: AiSettings): Promise<void> {
  const target = presetById(pid);
  const tkey = st.keys[pid] ?? '';
  try {
    const models = await fetchModels(target, tkey, pid === st.provider ? st.baseOverride || undefined : undefined);
    const next = loadSettings();
    next.modelLists = { ...next.modelLists, [pid]: models.slice(0, 500) };
    next.fetchedAt = { ...next.fetchedAt, [pid]: Date.now() };
    saveSettings(next);
    postToPanel({ type: 'ai:modelsResult', provider: pid, models });
  } catch (e) {
    postToPanel({ type: 'ai:modelsResult', provider: pid, error: friendlyError(target.name, (e as Error).message) });
  }
}

async function handlePanelMessage(m: Record<string, unknown>): Promise<void> {
  const st = loadSettings();
  const preset: ProviderPreset = presetById(st.provider);
  const key = st.keys[st.provider] ?? '';
  if (m.type === 'ai:ready') {
    postToPanel({
      type: 'ai:init', presets: PROVIDERS, settings: publicSettings(st),
      skills: SKILLS.map((s) => ({ id: s.id, label: s.label, blurb: s.blurb }))
    });
    postToPanel({ type: 'ai:supa', ok: !!lastSupa });
    // Daily catalog refresh: stale or missing lineups for listable companies
    // (public, local, or keyed) refetch quietly in the background, staggered
    // so providers don't get hammered. Results land via ai:modelsResult.
    void (async () => {
      const cur = loadSettings();
      const due = PROVIDERS.filter((p) => {
        if (!p.modelsPath) return false;
        if (!(p.publicModels || p.loopback || cur.keys[p.id])) return false;
        const at = (cur.fetchedAt ?? {})[p.id] ?? 0;
        return Date.now() - at > MODEL_LIST_TTL;
      });
      for (let i = 0; i < due.length; i++) {
        if (i > 0) await new Promise((r) => setTimeout(r, 800));
        await refreshModels(due[i].id, loadSettings());
      }
    })();
    return;
  }
  if (m.type === 'ai:saveSettings') {
    const next: AiSettings = {
      provider: String(m.provider || 'zen'),
      model: String(m.model || ''),
      baseOverride: String(m.baseOverride || ''),
      completeOn: m.completeOn !== false,
      completeModel: String(m.completeModel || ''),
      keys: { ...st.keys },
      modelLists: { ...st.modelLists },
      fetchedAt: { ...st.fetchedAt },
      skills: Array.isArray(m.skills)
        ? (m.skills as unknown[]).filter((x): x is string => typeof x === 'string').slice(0, 8)
        : st.skills
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
    await refreshModels(pid, st);
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
      const skillIds = Array.isArray(m.skills)
        ? (m.skills as unknown[]).filter((x): x is string => typeof x === 'string')
        : st.skills;
      // Tools ride only the openai-chat wire format (llm.ts gates them too).
      const withTools = preset.format === 'openai-chat';
      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt(ctx, skillIds, withTools) },
        { role: 'user', content: String(m.text || '') }
      ];
      // Tool rounds: the model may act on the project, then continue
      // chatting with the results. Bounded so a confused model can't loop.
      for (let round = 0; round < 4; round++) {
        const toolCalls: ToolCall[] = [];
        const out = await streamChat({
          preset, baseOverride: st.baseOverride || undefined, key,
          model, messages, signal: ctl.signal,
          tools: withTools ? TOOL_DEFS : undefined,
          onTools: (calls) => { toolCalls.push(...calls); },
          onToken: (t) => postToPanel({ type: 'ai:chunk', id, token: t })
        });
        if (!toolCalls.length) break;
        messages.push({ role: 'assistant', content: out, toolCalls });
        for (const tc of toolCalls) {
          const r = await runTool(tc);
          postToPanel({ type: 'ai:tool', id, name: tc.name, ok: r.ok, summary: r.summary, diff: r.diff, added: r.added, removed: r.removed });
          messages.push({ role: 'tool', toolCallId: tc.id, content: r.payload });
        }
        if (ctl.signal.aborted) throw new Error('Stopped.');
      }
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
  if (m.type === 'ai:answer') {
    const r = askResolvers.get(String(m.id || ''));
    if (r) {
      askResolvers.delete(String(m.id || ''));
      r(String(m.choice || ''));
    }
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
// Inline permission answers. Nothing sends ai:ask yet (that gate lands with
// the agent behavior track); the map exists so the panel's permission row
// has a working counterpart the day it does. Unmatched answers are ignored.
const askResolvers = new Map<string, (choice: string) => void>();

function showPanel(): void {
  if (!panelEl) return;
  try {
    setPartVisibility(Parts.PANEL_PART, true);
  } catch { /* part api hiccup */ }
  panelEl.style.display = 'flex';
  // The part API fails silently (see try above): verify it actually opened
  // and say so out loud instead of swallowing the click.
  try {
    if (!isPartVisibile(Parts.PANEL_PART)) {
      vscode.window.showInformationMessage(
        'Cudic AI is on, but the bottom panel stayed shut — open it with View > Appearance > Panel, then press ✦ again.'
      );
    }
  } catch { /* unreadable state; the panel may still show */ }
}

function hidePanel(): void {
  if (panelEl) panelEl.style.display = 'none';
}

function el(html: string): HTMLElement {
  const t = document.createElement('template');
  t.innerHTML = html;
  return t.content.firstElementChild as HTMLElement;
}

// Mounts the chat panel as an overlay filling the bottom panel part.
// Called with the workbench shadow root; retries until the part exists.
export function registerCudicAi(shadowRoot: ShadowRoot): void {
  const mount = (): boolean => {
    const part = shadowRoot.querySelector('.part.panel') as HTMLElement | null;
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
      iframeEl.srcdoc = chatHtmlRaw
        .replaceAll('__NONCE__', nonce())
        .replace('/*__TERMINAL_CSS__*/', terminalCss);
      panelEl.append(bar, iframeEl);
      part.appendChild(panelEl);
      window.addEventListener('message', (e: MessageEvent) => {
        if (e.source !== iframeEl?.contentWindow) return;
        void handlePanelMessage((e.data || {}) as Record<string, unknown>);
      });
      // No title-bar button: entry is the command palette + right-click
      // menus (cudic-ai.openChat below).
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
          menu: [
            { id: MenuId.CommandPalette },
            // Right-click a file in the Explorer
            { id: MenuId.ExplorerContext, group: 'navigation' },
            // Right-click inside an editor
            { id: MenuId.EditorContext, group: 'navigation' }
          ]
        });
      }
      async run(): Promise<void> {
        mount();
        showPanel();
        // Temporary diagnostic: proves the command ran and reports what the
        // layout service thinks. Remove once opening is confirmed working.
        try {
          const vis = isPartVisibile(Parts.PANEL_PART);
          void vscode.window.showInformationMessage(
            'Cudic AI: command ran — bottom panel reads ' + (vis ? 'VISIBLE' : 'HIDDEN') + '.'
          );
        } catch { /* layout service unreadable */ }
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
