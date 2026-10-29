// Collab editing: peer-to-peer via Yjs + y-webrtc (open source).
// Mounted as a left-sidebar panel (like Explorer/Search) instead of a
// floating widget. Auto-reconnects on reload using the saved room code.
import * as vscode from 'vscode';
import * as monaco from 'monaco-editor';
import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';
import {
  registerAction2,
  Action2,
  MenuId
} from '@codingame/monaco-vscode-api/vscode/vs/platform/actions/common/actions';
import { collectTextFiles } from './project';
import { getProjectId } from './project';

let doc: Y.Doc | null = null;
let provider: WebrtcProvider | null = null;
let filesMap: Y.Map<string> | null = null;
let chatArr: Y.Array<{ name: string; color: string; text: string; ts: number }> | null = null;
let roomCode = '';
let localName = 'guest';
let localColor = '#b8f23a';
let applyingRemote = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let lastSent = new Map<string, string>();
let perceived = new Map<string, string>();
let peerDecorations = new Map<number, vscode.TextEditorDecorationType>();
let panel: HTMLDivElement | null = null;
let msgList: HTMLUListElement | null = null;
let peopleEl: HTMLDivElement | null = null;
let tabIcon: HTMLButtonElement | null = null;
let disposed = false;
// Workbench shadow root, injected from main.ts (same pattern as registerCudicAi).
let sr: ShadowRoot | null = null;

const PALETTE = ['#b8f23a', '#3f7cff', '#9fd0ff', '#ff8c1a', '#ff5b3d', '#c77dff', '#f2c94c', '#5bd695'];

const GUEST_ADJ = ['brave', 'zippy', 'quiet', 'cosmic', 'lucky', 'fuzzy', 'bold', 'pixel', 'mellow', 'tidy', 'noble', 'nimble', 'snappy', 'soft'];
const GUEST_NOUN = ['otter', 'tortoise', 'falcon', 'gecko', 'panda', 'ferret', 'walrus', 'raven', 'axolotl', 'lemur', 'puffin', 'badger', 'ocelot', 'ibex'];

// Guests get an anonymous two-word name, kept across reloads so peers see one
// stable identity; signed-in users override it with their display name.
function guestName(): string {
  try {
    const saved = localStorage.getItem('cudic_collab_name');
    if (saved) return saved;
    const n = GUEST_ADJ[(Math.random() * GUEST_ADJ.length) | 0] + ' ' + GUEST_NOUN[(Math.random() * GUEST_NOUN.length) | 0];
    localStorage.setItem('cudic_collab_name', n);
    return n;
  } catch (e) {
    return 'guest ' + ((Math.random() * 90 + 10) | 0);
  }
}

function colorFor(id: number): string {
  return PALETTE[id % PALETTE.length];
}

function wsPath(uri: vscode.Uri): string {
  const p = uri.path;
  return p.replace(/^\/workspace\//, '');
}

async function currentFiles(): Promise<Record<string, string>> {
  try { return await collectTextFiles(); } catch (e) { return {}; }
}

async function flushLocal() {
  if (!filesMap || applyingRemote) return;
  const files = await currentFiles();
  const next = new Set<string>();
  for (const [p, text] of Object.entries(files)) {
    next.add(p);
    if (lastSent.get(p) !== text) {
      lastSent.set(p, text);
      perceived.set(p, text);
      try { filesMap.set(p, text); } catch (e) {}
    }
  }
  for (const p of Array.from(lastSent.keys())) {
    if (!next.has(p)) {
      lastSent.delete(p); perceived.delete(p);
      try { filesMap.delete(p); } catch (e) {}
      try { await vscode.workspace.fs.delete(vscode.Uri.file('/workspace/' + p)); } catch (e) {}
    }
  }
}

async function applyRemoteFile(path: string, text: string | undefined) {
  applyingRemote = true;
  try {
    const uri = vscode.Uri.file('/workspace/' + path);
    if (text === undefined) {
      try { await vscode.workspace.fs.delete(uri); } catch (e) {}
      return;
    }
    let doc: vscode.TextDocument;
    try {
      doc = await vscode.workspace.openTextDocument(uri);
    } catch (e) {
      try { await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(text)); } catch (e2) {}
      return;
    }
    // Partial replace: trim the common prefix/suffix so only the changed middle
    // region is edited. Whole-file replacement yanked the peer's cursor and ate
    // keystrokes when two people typed in the same file.
    const cur = doc.getText();
    if (cur === text) return;
    const min = Math.min(cur.length, text.length);
    let start = 0;
    while (start < min && cur.charCodeAt(start) === text.charCodeAt(start)) start++;
    let suffix = 0;
    while (
      suffix < cur.length - start && suffix < text.length - start &&
      cur.charCodeAt(cur.length - 1 - suffix) === text.charCodeAt(text.length - 1 - suffix)
    ) suffix++;
    const rep = text.slice(start, text.length - suffix);
    const end = cur.length - suffix;
    const edit = new vscode.WorkspaceEdit();
    edit.replace(uri, new vscode.Range(doc.positionAt(start), doc.positionAt(end)), rep);
    const ok = await vscode.workspace.applyEdit(edit);
    if (!ok) {
      const full = new vscode.WorkspaceEdit();
      full.replace(uri, new vscode.Range(doc.positionAt(0), doc.positionAt(cur.length)), text);
      try { await vscode.workspace.applyEdit(full); } catch (e2) {}
    }
  } finally {
    applyingRemote = false;
  }
}

function publishCursor() {
  if (!provider) return;
  const ed = vscode.window.activeTextEditor;
  if (!ed) return;
  const path = wsPath(ed.document.uri);
  const sel = ed.selection;
  provider.awareness.setLocalStateField('cursor', {
    path,
    start: { line: sel.start.line, character: sel.start.character },
    end: { line: sel.end.line, character: sel.end.character }
  });
}

function clearPeerDecorations() {
  for (const [key, d] of peerDecorations) {
    try { d.dispose(); } catch (e) {}
  }
  peerDecorations.clear();
}

function renderPeerCursors() {
  if (!provider || !panel) return;
  const states = provider.awareness.getStates();
  const ed = vscode.window.activeTextEditor;
  const openPath = ed ? wsPath(ed.document.uri) : null;
  clearPeerDecorations();
  for (const [clientId, state] of states.entries()) {
    const s = state as any;
    if (!s || !s.cursor || clientId === provider.awareness.clientID) continue;
    const c = s.cursor;
    if (!openPath || c.path !== openPath) continue;
    try {
      const dec = vscode.window.createTextEditorDecorationType({
        backgroundColor: (s.user && s.user.color || '#fff') + '33',
        before: {
          contentText: (s.user && s.user.name || '?') + ' ',
          color: s.user && s.user.color || '#fff',
          fontWeight: '600',
          margin: '0 4px 0 0'
        }
      });
      const range = new vscode.Range(
        new vscode.Position(c.start.line, c.start.character),
        new vscode.Position(c.end.line, c.end.character)
      );
      ed.setDecorations(dec, [range]);
      peerDecorations.set(clientId, dec);
    } catch (e) {}
  }
}

function updatePeople() {
  if (!provider || !peopleEl) return;
  const states = provider.awareness.getStates();
  const names: string[] = [];
  for (const [clientId, state] of states.entries()) {
    const s = state as any;
    if (s && s.user && clientId !== provider.awareness.clientID) names.push(s.user.name);
  }
  peopleEl.textContent = names.length ? 'In room: ' + names.join(', ') : 'In room: just you';
}

function renderChat() {
  if (!chatArr || !msgList) return;
  const items = chatArr.toArray();
  msgList.innerHTML = '';
  items.slice(-50).forEach((m) => {
    const li = document.createElement('li');
    const who = document.createElement('b');
    who.textContent = m.name + ': ';
    who.style.color = m.color;
    const txt = document.createElement('span');
    txt.textContent = m.text;
    const t = document.createElement('span');
    t.className = 't';
    t.textContent = new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    li.appendChild(who); li.appendChild(txt); li.appendChild(t);
    msgList.appendChild(li);
  });
  if (msgList.scrollHeight) msgList.scrollTop = msgList.scrollHeight;
}

function sendChat() {
  // Panel lives in the workbench shadow root — document.getElementById can't see it.
  const input = panel?.querySelector('#collabChatInput') as HTMLInputElement | null;
  if (!input || !chatArr || !provider) return;
  const text = input.value.trim();
  if (!text) return;
  try {
    chatArr.push([{ name: localName, color: localColor, text, ts: Date.now() }]);
    input.value = '';
    renderChat(); // local echo now, don't wait on the observer wiring
    input.focus();
  } catch (err) {
    // Surface instead of vanishing silently.
    const st = panel?.querySelector('#collabStatus') as HTMLElement | null;
    if (st) { st.textContent = '!'; st.title = 'Send failed: ' + String(err); }
  }
}

// Permanent activity-bar tab (like Explorer/Search icons). Click toggles the
// session panel; clicking with no session starts one.
// Active state = left accent bar + faint tint (VS Code item style) — never a
// filled background, that painted a big pale box over the icon.
function setTabActive(on: boolean): void {
  if (!tabIcon) return;
  tabIcon.style.borderLeft = on ? '3px solid #b8f23a' : '3px solid transparent';
  tabIcon.style.background = on ? 'rgba(184,242,58,.08)' : 'transparent';
  tabIcon.style.color = on ? '#f7f5ec' : 'var(--vscode-activityBar-foreground,#a6abb2)';
}

function buildTabIcon(): boolean {
  if (tabIcon || !sr) return true;
  const act = sr.querySelector('.part.activitybar') as HTMLElement | null;
  if (!act) return false;
  tabIcon = document.createElement('button');
  tabIcon.id = 'cudic-collab-tab';
  tabIcon.title = 'Collab';
  tabIcon.setAttribute('aria-label', 'Collab');
  tabIcon.style.cssText =
    'position:absolute;left:0;bottom:76px;width:48px;height:48px;display:flex;align-items:center;justify-content:center;' +
    'border:3px solid transparent;outline:none;color:var(--vscode-activityBar-foreground,#a6abb2);cursor:pointer;z-index:60;';
  tabIcon.innerHTML =
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">' +
    '<circle cx="9" cy="8" r="3.4"/><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/>' +
    '<circle cx="17" cy="9" r="2.6"/><path d="M14.8 19.8c.3-2.9 2.3-4.6 4.9-4.6 1 0 2 .3 2.8.8"/></svg>';
  tabIcon.addEventListener('click', () => {
    if (panel) {
      const show = panel.style.display === 'none';
      panel.style.display = show ? 'flex' : 'none';
      setTabActive(show);
    } else {
      connectRoom(defaultRoom());
    }
  });
  tabIcon.addEventListener('mouseenter', () => {
    if (panel && panel.style.display !== 'none') return;
    tabIcon!.style.background = 'rgba(184,242,58,.06)';
  });
  tabIcon.addEventListener('mouseleave', () => {
    if (panel && panel.style.display !== 'none') return;
    tabIcon!.style.background = 'transparent';
  });
  if (getComputedStyle(act).position === 'static') act.style.position = 'relative';
  act.appendChild(tabIcon);
  return true;
}

function buildSidebarPanel(code: string) {
  if (!sr) return false;
  const side = sr.querySelector('.part.sidebar') as HTMLElement | null;
  if (!side) return false;
  if (getComputedStyle(side).position === 'static') side.style.position = 'relative';

  // Panel overlays the sidebar content (Explorer etc.) while visible.
  if (panel) { panel.style.display = 'flex'; setTabActive(true); return true; }

  // Cudic brand tokens (same set as brand.html / design.md v2), declared on the
  // panel itself so they resolve inside the workbench shadow root.
  panel = document.createElement('div');
  panel.id = 'cudic-collab-panel';
  panel.style.cssText =
    'position:absolute;inset:0;display:flex;flex-direction:column;overflow:hidden;z-index:100;' +
    '--bg:#0d0e10;--panel:#14161b;--line:#262a33;--ink:#f7f5ec;--mute:#9a9a94;--lime:#b8f23a;' +
    'font:400 13px/1.5 "Geist",system-ui,sans-serif;color:var(--ink);background:var(--panel);';

  const MONO = '"Geist Mono",ui-monospace,monospace';
  const BTN =
    'font-family:' + MONO + ';font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.06em;' +
    'cursor:pointer;border-radius:0;transition:background .12s steps(2),color .12s steps(2),border-color .12s steps(2);';
  panel.innerHTML =
    '<style>' +
    '#cudic-collab-panel .cl-row{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--line)}' +
    '#collabChatInput{flex:1;min-width:0;background:var(--bg);color:var(--ink);border:1px solid var(--line);' +
    'border-radius:0;font:inherit;padding:7px 10px;outline:none}' +
    '#collabChatInput:focus{border-color:var(--lime)}' +
    '#collabSend{background:var(--lime);color:#0d0e10;border:1px solid var(--lime);padding:8px 14px;' + BTN + '}' +
    '#collabSend:hover{background:var(--ink);color:var(--bg);border-color:var(--ink)}' +
    '#collabCopy{background:var(--panel);color:var(--ink);border:1px solid var(--ink);padding:5px 10px;' + BTN + '}' +
    '#collabCopy:hover{background:var(--ink);color:var(--bg)}' +
    '#collabLeave{background:transparent;color:var(--ink);border:1px solid var(--ink);padding:8px 14px;width:100%;' + BTN + '}' +
    '#collabLeave:hover{background:var(--ink);color:var(--bg)}' +
    '#collabMsgs{flex:1;margin:0;padding:10px 12px;list-style:none;overflow-y:auto;background:var(--bg)}' +
    '#collabMsgs li{margin:0 0 10px;font-size:12px}' +
    '#collabMsgs b{font-weight:600}' +
    '#collabMsgs .t{font-family:' + MONO + ';font-size:10px;color:var(--mute);margin-left:6px}' +
    '</style>' +
    '<div class="cl-row">' +
    '<span aria-hidden="true" style="width:8px;height:8px;background:var(--lime);flex:none"></span>' +
    '<b style="font-weight:500;letter-spacing:-.02em;font-size:14px">Collab</b>' +
    '<code id="collabCode" title="' + code + '" style="flex:1;min-width:0;font-family:' + MONO + ';font-size:11px;' +
    'letter-spacing:.02em;color:var(--mute);background:var(--bg);border:1px solid var(--line);padding:3px 8px;' +
    'white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + code + '</code>' +
    '<button id="collabCopy" title="Copy room code">copy</button>' +
    '<span id="collabStatus" title="Connection status" style="font-family:' + MONO + ';font-size:10px;color:var(--mute)">…</span>' +
    '</div>' +
    '<div id="collabPeople" class="cl-row" style="font-family:' + MONO + ';font-size:11px;color:var(--mute)"></div>' +
    '<ul id="collabMsgs"></ul>' +
    '<div class="cl-row" style="border-bottom:0">' +
    '<input id="collabChatInput" placeholder="Message…"/>' +
    '<button id="collabSend">Send</button>' +
    '</div>' +
    '<div class="cl-row" style="border-bottom:0;border-top:1px solid var(--line)">' +
    '<button id="collabLeave">Leave session</button>' +
    '</div>';

  side.appendChild(panel);
  msgList = panel.querySelector('#collabMsgs') as HTMLUListElement;
  peopleEl = panel.querySelector('#collabPeople') as HTMLDivElement;

  panel.querySelector('#collabCopy')!.addEventListener('click', () => {
    try { navigator.clipboard.writeText(code); } catch (e) {}
  });
  panel.querySelector('#collabSend')!.addEventListener('click', sendChat);
  panel.querySelector('#collabChatInput')!.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendChat();
  });
  panel.querySelector('#collabLeave')!.addEventListener('click', () => {
    teardown();
    try { localStorage.removeItem('cudic_collab_room'); } catch (e) {}
    vscode.window.showInformationMessage('Left the collab session.');
  });

  return true;
}

function teardown() {
  disposed = true;
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  clearPeerDecorations();
  if (provider) { try { provider.destroy(); } catch (e) {} }
  if (doc) { try { doc.destroy(); } catch (e) {} }
  provider = null; doc = null; filesMap = null; chatArr = null;
  if (panel) { panel.remove(); panel = null; }
  setTabActive(false);
  msgList = null; peopleEl = null;
}

function connectRoom(code: string) {
  teardown();
  disposed = false;
  roomCode = code;
  localName = guestName(); // display_name replaces this below when signed in
  try { localStorage.setItem('cudic_collab_room', code); } catch (e) {}
  doc = new Y.Doc();
  filesMap = doc.getMap('files');
  chatArr = doc.getArray('chat');
  provider = new WebrtcProvider(code, doc, {
    signaling: ['wss://signaling.yjs.dev', 'wss://y-webrtc-signaling-eu.herokuapp.com']
  });
  localColor = colorFor(provider.awareness.clientID);
  provider.awareness.setLocalStateField('user', { name: localName, color: localColor });

  // Use the signed-in display name when available.
  (async () => {
    try {
      const tokRaw = localStorage.getItem('sb-opimjwmgmzwapkzgxvhk-auth-token');
      if (!tokRaw) return;
      const tok = (() => { try { const j = JSON.parse(tokRaw); return j && j.access_token || tokRaw; } catch (e) { return tokRaw; } })();
      const r = await fetch('/api/profile', { headers: { 'Authorization': 'Bearer ' + tok } });
      if (r.ok) {
        const d = await r.json();
        if (d.profile && d.profile.display_name) {
          localName = d.profile.display_name;
          provider.awareness.setLocalStateField('user', { name: localName, color: localColor });
          updatePeople();
        }
      }
    } catch (e) {}
  })();

  filesMap.observeDeep(() => {
    if (!filesMap) return;
    filesMap.forEach((text, path) => {
      const known = perceived.get(path);
      if (known === text) return;
      perceived.set(path, text);
      if (text === undefined) {
        void applyRemoteFile(path, undefined);
      } else if (typeof text === 'string') {
        void applyRemoteFile(path, text);
      }
    });
  });

  chatArr.observe(() => renderChat());
  provider.awareness.on('change', () => {
    updatePeople();
    renderPeerCursors();
  });

  vscode.window.onDidChangeTextEditorSelection(() => { publishCursor(); renderPeerCursors(); });
  vscode.window.onDidChangeActiveTextEditor(() => { publishCursor(); renderPeerCursors(); });
  vscode.workspace.onDidChangeTextDocument((e) => {
    if (applyingRemote || !filesMap) return;
    const raw = e.document.uri.path;
    if (!raw.startsWith('/workspace/')) return; // ignore non-project docs
    const p = wsPath(e.document.uri);
    // Fast path: exactly the changed doc goes out now (no full rescan delay).
    const text = e.document.getText();
    if (lastSent.get(p) !== text) {
      lastSent.set(p, text);
      perceived.set(p, text);
      try { filesMap.set(p, text); } catch (err) {}
    }
    // Slow path: housekeeping for file adds/deletes only.
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(() => void flushLocal(), 1500);
  });

  if (!buildSidebarPanel(roomCode)) {
    const timer = setInterval(() => {
      if (buildSidebarPanel(roomCode)) clearInterval(timer);
    }, 500);
    setTimeout(() => clearInterval(timer), 10000);
  }
  const statusEl = panel?.querySelector('#collabStatus');
  if (statusEl) {
    (statusEl as HTMLElement).textContent = 'connecting';
    provider.on('status', (e: { connected: boolean }) => {
      (statusEl as HTMLElement).textContent = e.connected ? '●' : '○';
      (statusEl as HTMLElement).style.color = e.connected
        ? 'var(--vscode-terminal-ansiGreen,#23d18b)'
        : 'var(--vscode-descriptionForeground,#9d9d9d)';
      (statusEl as HTMLElement).title = e.connected ? 'Connected to room' : 'Not connected (P2P blocked?)';
    });
  }
  updatePeople();
  renderChat();
  void flushLocal();
  publishCursor();
  vscode.window.showInformationMessage('Collab room ready: ' + code + ' — share this code to invite others.');
}

function defaultRoom(): string {
  const saved = localStorage.getItem('cudic_collab_room');
  if (saved) return saved;
  const pid = getProjectId();
  if (pid) return 'p-' + pid.slice(0, 8);
  const rnd = Array.from({ length: 4 }, () => 'abcdefghjkmnpqrstuvwxyz23456789'[(Math.random() * 32) | 0]).join('');
  return 'r-' + rnd;
}

export function registerCollabCommands(shadowRoot: ShadowRoot): void {
  sr = shadowRoot;
  // The panel uses the Cudic brand type (Geist / Geist Mono) — load once per page.
  try {
    if (!document.querySelector('link[data-cudic-fonts]')) {
      const lf = document.createElement('link');
      lf.rel = 'stylesheet';
      lf.href = 'https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap';
      lf.setAttribute('data-cudic-fonts', '1');
      document.head.appendChild(lf);
    }
  } catch (e) {}
  // The tab icon races the workbench mount — retry until the part exists.
  const icoTimer = setInterval(() => { if (buildTabIcon()) clearInterval(icoTimer); }, 400);
  setTimeout(() => clearInterval(icoTimer), 15000);
  registerAction2(
    class extends Action2 {
      constructor() {
        super({
          id: 'glox.startCollab',
          title: { value: 'Cudic: Start collab session', original: 'Cudic: Start collab session' },
          menu: [{ id: MenuId.CommandPalette }]
        });
      }
      async run(): Promise<void> {
        connectRoom(defaultRoom());
      }
    }
  );
  registerAction2(
    class extends Action2 {
      constructor() {
        super({
          id: 'glox.joinCollab',
          title: { value: 'Cudic: Join collab session…', original: 'Cudic: Join collab session…' },
          menu: [{ id: MenuId.CommandPalette }]
        });
      }
      async run(): Promise<void> {
        const code = await vscode.window.showInputBox({ prompt: 'Paste the collab code', value: '', ignoreFocusOut: true });
        if (code && code.trim()) connectRoom(code.trim());
      }
    }
  );
  registerAction2(
    class extends Action2 {
      constructor() {
        super({
          id: 'glox.stopCollab',
          title: { value: 'Cudic: Leave collab session', original: 'Cudic: Leave collab session' },
          menu: [{ id: MenuId.CommandPalette }]
        });
      }
      async run(): Promise<void> {
        teardown();
        try { localStorage.removeItem('cudic_collab_room'); } catch (e) {}
        vscode.window.showInformationMessage('Left the collab session.');
      }
    }
  );
  // Auto-reconnect on reload if a room was active.
  (async () => {
    try {
      const saved = localStorage.getItem('cudic_collab_room');
      if (!saved) return;
      // small delay to let the workbench + project load first
      await new Promise((r) => setTimeout(r, 1500));
      connectRoom(saved);
    } catch (e) {}
  })();
}
