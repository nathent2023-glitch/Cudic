// Collab editing: peer-to-peer via Yjs + y-webrtc (open source).
// Edits, cursors and chat flow directly between browsers; the server only
// brokers the initial WebRTC connection (Yjs public signaling), so this adds
// near-zero load to the backend. Room peers = same code; files sync via a
// Y.Map (text files only; binaries stay local), presence via awareness.
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
let peerDecorations = new Map<number, vscode.TextEditorDecorationType>();
let widget: HTMLDivElement | null = null;
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
      try { filesMap.set(p, text); } catch (e) {}
    }
  }
  for (const p of Array.from(lastSent.keys())) {
    if (!next.has(p)) { lastSent.delete(p); try { filesMap.delete(p); } catch (e) {} }
  }
}

async function applyRemoteFile(path: string, text: string | undefined) {
  applyingRemote = true;
  try {
    const uri = vscode.Uri.file('/workspace/' + path);
    if (text === undefined) {
      try { await vscode.workspace.fs.delete(uri); } catch (e) {}
    } else {
      try { await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(text)); } catch (e) {}
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
  if (!provider || !widget) return;
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

function buildWidget(code: string) {
  if (widget) { widget.style.display = ''; return; }
  widget = document.createElement('div');
  widget.id = 'collabWidget';
  widget.style.cssText = 'position:fixed;left:14px;bottom:14px;z-index:9998;width:280px;background:#14161b;border:1px solid #262a33;border-radius:6px;color:#f7f5ec;font:400 12px/1.5 system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.45);display:flex;flex-direction:column;overflow:hidden';
  widget.innerHTML =
    '<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid #262a33;background:#0d0e10">' +
    '<b style="font-size:12px">Collab</b>' +
    '<code id="collabCode" style="flex:1;font-size:11px;color:#9a9a94;background:#0d0e10;border:1px solid #262a33;border-radius:4px;padding:2px 6px">' + code + '</code>' +
    '<button id="collabCopy" title="Copy room code" style="background:none;border:1px solid #262a33;color:#f7f5ec;border-radius:4px;cursor:pointer;padding:2px 8px;font-size:11px">copy</button>' +
    '<button id="collabClose" title="Close" style="background:none;border:0;color:#9a9a94;cursor:pointer;font-size:14px;line-height:1">×</button>' +
    '</div>' +
    '<div id="collabPeople" style="padding:6px 10px;color:#9a9a94;font-size:11px;border-bottom:1px solid #1c2027"></div>' +
    '<ul id="collabMsgs" style="flex:1;margin:0;padding:8px 10px;list-style:none;max-height:150px;overflow-y:auto;font-size:12px"></ul>' +
    '<div style="display:flex;gap:6px;padding:8px 10px;border-top:1px solid #262a33">' +
    '<input id="collabChatInput" placeholder="Message…" style="flex:1;background:#0d0e10;border:1px solid #262a33;border-radius:4px;color:#f7f5ec;font:inherit;padding:5px 8px;outline:none">' +
    '<button id="collabSend" style="background:#b8f23a;color:#0d0e10;border:0;border-radius:4px;cursor:pointer;padding:0 10px;font-weight:600;font-size:11px">Send</button>' +
    '</div>';
  document.body.appendChild(widget);
  msgList = widget.querySelector('#collabMsgs') as HTMLUListElement;
  peopleEl = widget.querySelector('#collabPeople') as HTMLDivElement;
  widget.querySelector('#collabCopy')!.addEventListener('click', () => {
    try { navigator.clipboard.writeText(code); } catch (e) {}
  });
  widget.querySelector('#collabClose')!.addEventListener('click', () => {
    if (widget) widget.style.display = 'none';
  });
  widget.querySelector('#collabSend')!.addEventListener('click', sendChat);
  widget.querySelector('#collabChatInput')!.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendChat();
  });
}

function teardown() {
  disposed = true;
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  clearPeerDecorations();
  if (provider) { try { provider.destroy(); } catch (e) {} }
  if (doc) { try { doc.destroy(); } catch (e) {} }
  provider = null; doc = null; filesMap = null; chatArr = null;
  if (widget) { widget.remove(); widget = null; }
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
    const local = new Set(lastSent.keys());
    filesMap.forEach((text, path) => {
      if (local.has(path)) return;
      if (typeof text === 'string') void applyRemoteFile(path, text);
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

  buildWidget(code);
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
}
