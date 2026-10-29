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
let localName = 'Me';
let localColor = '#b8f23a';
let applyingRemote = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let lastSent = new Map<string, string>();
let perceived = new Map<string, string>();
let peerDecorations = new Map<number, vscode.TextEditorDecorationType>();
let panel: HTMLDivElement | null = null;
let msgList: HTMLUListElement | null = null;
let peopleEl: HTMLDivElement | null = null;
let disposed = false;

const PALETTE = ['#b8f23a', '#3f7cff', '#9fd0ff', '#ff8c1a', '#ff5b3d', '#c77dff', '#f2c94c', '#5bd695'];

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
    const full = new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length));
    const edit = new vscode.WorkspaceEdit();
    edit.replace(uri, full, text);
    const ok = await vscode.workspace.applyEdit(edit);
    if (!ok) {
      try { await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(text)); } catch (e2) {}
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
    li.appendChild(who); li.appendChild(txt);
    msgList.appendChild(li);
  });
  if (msgList.scrollHeight) msgList.scrollTop = msgList.scrollHeight;
}

function sendChat() {
  const input = document.getElementById('collabChatInput') as HTMLInputElement | null;
  if (!input || !chatArr || !provider) return;
  const text = input.value.trim();
  if (!text) return;
  chatArr.push([{ name: localName, color: localColor, text, ts: Date.now() }]);
  input.value = '';
}

function buildSidebarPanel(code: string) {
  const part = (shadowRoot as ShadowRoot).querySelector('.part.sidebar') as HTMLElement | null;
  if (!part) return false;
  if (panel) { panel.style.display = ''; return true; }
  if (getComputedStyle(part).position === 'static') part.style.position = 'relative';

  // Container for our panel — appended into the sidebar
  panel = document.createElement('div');
  panel.id = 'cudic-collab-panel';
  panel.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow:hidden;font:400 12px/1.5 system-ui,sans-serif;color:#f7f5ec;background:#14161b;border-top:1px solid #262a33;';

  panel.innerHTML =
    '<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid #262a33;background:#0d0e10">' +
    '<b style="font-size:12px">Collab</b>' +
    '<code id="collabCode" style="flex:1;font-size:10px;color:#9a9a94;background:#0d0e10;border:1px solid #262a33;border-radius:4px;padding:2px 6px;overflow:hidden;text-overflow:ellipsis">' + code + '</code>' +
    '<span id="collabStatus" title="Connection status" style="font-size:10px;color:#9a9a94">…</span>' +
    '<button id="collabCopy" title="Copy room code" style="background:none;border:1px solid #262a33;color:#f7f5ec;border-radius:4px;cursor:pointer;padding:2px 8px;font-size:10px">copy</button>' +
    '</div>' +
    '<div id="collabPeople" style="padding:6px 12px;color:#9a9a94;font-size:11px;border-bottom:1px solid #1c2027"></div>' +
    '<ul id="collabMsgs" style="flex:1;margin:0;padding:8px 12px;list-style:none;max-height:none;overflow-y:auto;font-size:12px"></ul>' +
    '<div style="display:flex;gap:6px;padding:8px 12px;border-top:1px solid #262a33">' +
    '<input id="collabChatInput" placeholder="Message…" style="flex:1;background:#0d0e10;border:1px solid #262a33;border-radius:4px;color:#f7f5ec;font:inherit;padding:5px 8px;outline:none;font-size:12px">' +
    '<button id="collabSend" style="background:#b8f23a;color:#0d0e10;border:0;border-radius:4px;cursor:pointer;padding:0 10px;font-weight:600;font-size:11px">Send</button>' +
    '</div>' +
    '<div style="padding:8px 12px;border-top:1px solid #1c2027;font-size:11px;color:#9a9a94">' +
    '<button id="collabLeave" style="background:none;border:1px solid #262a33;color:#f7f5ec;border-radius:4px;cursor:pointer;padding:3px 10px;font-size:11px">Leave session</button>' +
    '</div>';

  part.appendChild(panel);
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
  msgList = null; peopleEl = null;
}

function connectRoom(code: string) {
  teardown();
  disposed = false;
  roomCode = code;
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
  vscode.workspace.onDidChangeTextDocument(() => {
    if (applyingRemote) return;
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(() => void flushLocal(), 400);
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
      (statusEl as HTMLElement).style.color = e.connected ? '#b8f23a' : '#9a9a94';
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

export function registerCollabCommands(): void {
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
