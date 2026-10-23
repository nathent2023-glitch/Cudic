// Phase 2 — bridge Explorer ↔ Cudic backend (games.files JSON).
import * as vscode from 'vscode';
import * as monaco from 'monaco-editor';
import {
  registerAction2,
  Action2,
  MenuId
} from '@codingame/monaco-vscode-api/vscode/vs/platform/actions/common/actions';
import {
  RegisteredMemoryFile,
  type RegisteredFileSystemProvider
} from '@codingame/monaco-vscode-files-service-override';
import JSZip from 'jszip';
import { sceneToFiles } from './npmutil';
import { kenneyAssets, kenneyUrl, type KenneyAsset } from './kenney';

const DEMO: Record<string, string> = {
  'index.html':
    '<!DOCTYPE html>\n<html>\n<head>\n    <meta charset="UTF-8">\n    <title>Cudic Studio</title>\n    <link rel="stylesheet" href="style.css">\n</head>\n<body>\n    <h1>Cudic Studio shell</h1>\n</body>\n</html>\n',
  'style.css':
    "body {\n    font-family: 'Courier New', Courier, monospace;\n    background-color: #0d1117;\n    color: #c9d1d9;\n    display: flex;\n    justify-content: center;\n    align-items: center;\n    height: 100vh;\n    margin: 0;\n}\n\nh1 {\n    background-color: #161b22;\n    padding: 20px 40px;\n    border-radius: 6px;\n    border: 1px solid #30363d;\n    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);\n    letter-spacing: 1px;\n}\n"
};

export type FileContent = string | Uint8Array;
export type FileMap = Record<string, FileContent>;

export interface BootProject {
  id: string | null;
  title: string;
  files: FileMap;
}

let projectId: string | null = new URLSearchParams(location.search).get('id');
let projectTitle = 'Untitled Project';
let provider: RegisteredFileSystemProvider | null = null;
let registered: monaco.IDisposable[] = [];
// Paths currently held as raw bytes (imported/loaded binaries — never re-encoded).
const binaryPaths = new Set<string>();

export function getToken(): string | null {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k != null && k.startsWith('sb-') && k.endsWith('-auth-token')) {
        const s = JSON.parse(localStorage.getItem(k) ?? 'null');
        if (s?.access_token != null) return s.access_token as string;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

async function apiBase(): Promise<string> {
  try {
    // Mirror config.js: local dev talks to the local backend (same host)
    // so new endpoints work before they deploy.
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') return '';
    const t = await (await fetch('/config.js')).text();
    // NOTE: match the wss:// URL anywhere — config.js computes WS_URL with
    // a ternary, so `WS_URL = '...'` never literally appears in the file.
    const m = t.match(/(wss?:\/\/[^'"]+)/);
    if (m != null) return m[1].replace(/^wss?:\/\//, 'https://');
  } catch {
    // same-origin fallback
  }
  return '';
}

// WebSocket endpoint for the in-game multiplayer relay (preview mediator).
// Mirrors config.js: local dev always talks to the local server on :3000, even
// when Vite is serving the workbench from another port.
export async function relayWsUrl(): Promise<string> {
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') return 'ws://localhost:3000';
  const cfg = await getCfg();
  return cfg.api.replace(/^https/, 'wss');
}

function headers(json: boolean): Record<string, string> {
  const h: Record<string, string> = {};
  if (json) h['Content-Type'] = 'application/json';
  const t = getToken();
  if (t != null) h['Authorization'] = 'Bearer ' + t;
  try {
    const seat = localStorage.getItem('cudic_seat');
    if (seat != null) h['X-Seat'] = seat;
  } catch {
    // ignore
  }
  return h;
}

// Filled in by glox.ts (it owns the preview pane) — see note there.
export const previewBridge: {
  capture?: () => Promise<{ data: string } | { error: string } | null>;
} = {};

interface StorageCfg {
  api: string;
  url: string;
  anon: string;
}

let cfgCache: StorageCfg | null = null;
async function getCfg(): Promise<StorageCfg> {
  if (cfgCache != null) return cfgCache;
  const cfg: StorageCfg = { api: '', url: '', anon: '' };
  try {
    const t = await (await fetch('/config.js')).text();
    if (location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
      // Same NOTE as apiBase: WS_URL is computed, match the URL anywhere.
      const w = t.match(/(wss?:\/\/[^'"]+)/);
      if (w != null) cfg.api = w[1].replace(/^wss?:\/\//, 'https://');
    }
    const u = t.match(/SUPABASE_URL\s*=\s*['"]([^'"]+)/);
    if (u != null) cfg.url = u[1];
    const a = t.match(/SUPABASE_ANON_KEY\s*=\s*['"]([^'"]+)/);
    if (a != null) cfg.anon = a[1];
  } catch {
    // same-origin / unavailable
  }
  cfgCache = cfg;
  return cfg;
}

export function mimeOf(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  switch (ext) {
    case 'png': return 'image/png';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'gif': return 'image/gif';
    case 'svg': return 'image/svg+xml';
    case 'webp': return 'image/webp';
    case 'glb': return 'model/gltf-binary';
    case 'ico': return 'image/x-icon';
    case 'mp3': return 'audio/mpeg';
    case 'wav': return 'audio/wav';
    case 'ogg':
    case 'oga': return 'audio/ogg';
    case 'mp4': return 'video/mp4';
    case 'webm': return 'video/webm';
    case 'pdf': return 'application/pdf';
    case 'zip': return 'application/zip';
    case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'pptx': return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    case 'xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'xls': return 'application/vnd.ms-excel';
    case 'json': return 'application/json';
    default: return 'application/octet-stream';
  }
}

function encPath(p: string): string {
  return p.split('/').map(encodeURIComponent).join('/');
}

async function uploadAsset(
  cfg: StorageCfg,
  token: string,
  storagePath: string,
  bytes: Uint8Array,
  mime: string
): Promise<void> {
  const url = cfg.url + '/storage/v1/object/game-assets/' + encPath(storagePath);
  const head = {
    apikey: cfg.anon,
    Authorization: 'Bearer ' + token,
    'Content-Type': mime
  };
  // ponytail: POST-then-PUT covers create+overwrite without an SDK.
  let res = await fetch(url, { method: 'POST', headers: head, body: bytes });
  if (!res.ok) {
    res = await fetch(url, { method: 'PUT', headers: head, body: bytes });
  }
  if (!res.ok) throw new Error('asset upload ' + res.status);
}

async function walk(
  uri: monaco.Uri,
  prefix: string,
  out: FileMap
): Promise<void> {
  let entries: [string, vscode.FileType][];
  try {
    entries = await vscode.workspace.fs.readDirectory(uri);
  } catch {
    return;
  }
  for (const [name, type] of entries) {
    const child = monaco.Uri.joinPath(uri, name);
    const path = prefix === '' ? name : prefix + '/' + name;
    if (type === vscode.FileType.Directory) {
      await walk(child, path, out);
    } else if (!name.endsWith('.gloxpreview') && !name.endsWith('.code-workspace')) {
      try {
        const bytes = await vscode.workspace.fs.readFile(child);
        if (binaryPaths.has(path)) {
          out[path] = bytes;
          continue;
        }
        try {
          out[path] = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        } catch {
          out[path] = bytes;
          binaryPaths.add(path);
        }
      } catch {
        // skip unreadable
      }
    }
  }
}

async function collectFiles(): Promise<FileMap> {
  const out: FileMap = {};
  await walk(monaco.Uri.file('/workspace'), '', out);
  return out;
}

export async function collectBinaryFiles(): Promise<Record<string, Uint8Array>> {
  const all = await collectFiles();
  const out: Record<string, Uint8Array> = {};
  for (const [k, v] of Object.entries(all)) {
    if (typeof v !== 'string') out[k] = v;
  }
  return out;
}

export async function collectTextFiles(): Promise<Record<string, string>> {
  const all = await collectFiles();
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(all)) {
    if (typeof v === 'string') out[k] = v;
  }
  return out;
}

function registerFiles(files: FileMap): void {
  if (provider == null) return;
  for (const d of registered) d.dispose();
  registered = [];
  binaryPaths.clear();
  for (const [path, content] of Object.entries(files)) {
    if (typeof content !== 'string') binaryPaths.add(path);
    registered.push(
      provider.registerFile(
        new RegisteredMemoryFile(monaco.Uri.file('/workspace/' + path), content)
      )
    );
  }
}

export async function bootProject(): Promise<BootProject> {
  let result: BootProject = { id: null, title: projectTitle, files: { ...DEMO } };
  if (projectId != null) {
    try {
      const base = await apiBase();
      // Cache-bust: a failed load (e.g. a 404 served before a fix
      // deploys) must never come back from cache as "no files".
      // Owner token included: drafts 404 for anyone else now.
      const res = await fetch(base + '/api/games/' + encodeURIComponent(projectId) + '?t=' + Date.now(), { headers: headers(false) });
      const d = await res.json();
      const g = d?.game;
      if (g != null) {
        let files = g.files;
        if (typeof files === 'string') {
          try {
            files = JSON.parse(files);
          } catch {
            files = null;
          }
        }
        const manifest = (g.assets ?? {}) as Record<string, string>;
        const hasFiles = files != null && Object.keys(files).length > 0;
        const hasAssets = Object.keys(manifest).length > 0;
        if (hasFiles || hasAssets) {
          projectTitle = g.title || 'Untitled Project';
          const out: FileMap = { ...(files ?? {}) };
          if (hasAssets) {
            const cfg = await getCfg();
            for (const [path, sp] of Object.entries(manifest)) {
              try {
                const url =
                  cfg.url +
                  '/storage/v1/object/public/game-assets/' +
                  encPath(sp.replace(/^game-assets\//, ''));
                const r = await fetch(url);
                if (!r.ok) continue;
                // project.json is stored as a binary but edited as text
                if (path === 'project.json') {
                  out[path] = await r.text();
                } else {
                  out[path] = new Uint8Array(await r.arrayBuffer());
                }
              } catch {
                // keep the project loadable without this asset
              }
            }
          }
          result = { id: projectId, title: projectTitle, files: out };
        } else {
          // Legacy scene-JSON games (classic-editor era, no files): convert on
          // the fly so old projects open with their real content instead of the
          // demo template. The next save persists the files (one-time migration).
          const converted = sceneToFiles(
            (g as { scene?: unknown }).scene,
            typeof g.title === 'string' ? g.title : 'Untitled Project'
          );
          if (converted != null) {
            projectTitle =
              typeof g.title === 'string' && g.title ? g.title : 'Untitled Project';
            result = { id: projectId, title: projectTitle, files: converted };
          }
        }
      }
    } catch {
      // fall through to demo
    }
  }
  // Unsaved local work wins over the backend copy — a frozen tab shouldn't
  // cost anyone their edits.
  const snap = await snapGet(snapKey()).catch(() => null);
  if (snap != null) result = { ...result, title: snap.title, files: snap.files };
  return result;
}

export function applyProjectToProvider(
  p: RegisteredFileSystemProvider,
  boot: BootProject
): void {
  provider = p;
  projectTitle = boot.title;
  projectId = boot.id;
  registerFiles(boot.files);
}

// ---- Unsaved-work safety net ---------------------------------------------
// A frozen tab loses everything since the last save. Snapshot the live editor
// state to IndexedDB on a timer and on the way out, and put it back on boot.
const SNAP_DB = 'cudic-studio';
const SNAP_STORE = 'unsaved';
// Restore points are count-capped, not byte-capped: a project carrying large
// assets can eventually hit an IndexedDB quota error (every write here is
// already .catch()-swallowed). Lower MAX_SNAPS if that shows up in practice.
const MAX_SNAPS = 10;
const SNAP_SPACING_MS = 60_000;

interface Snapshot {
  id: string;
  title: string;
  files: FileMap;
  savedAt: number;
}

// Identifies the open project: its saved id, or 'draft' for a new one. Used by
// the snapshot ring and by the preview's multiplayer room.
export function projectKey(): string {
  return projectId ?? 'draft';
}

function snapKey(): string {
  return projectKey();
}

// Stored value is Snapshot[] newest-first; a bare Snapshot is an older build's
// record, so read it as a one-entry history.
function toHistory(v: unknown): Snapshot[] {
  if (Array.isArray(v)) return v as Snapshot[];
  if (v != null && typeof v === 'object') return [v as Snapshot];
  return [];
}

function openSnapDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SNAP_DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(SNAP_STORE)) {
        req.result.createObjectStore(SNAP_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function readHistory(db: IDBDatabase, id: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = db
      .transaction(SNAP_STORE, 'readonly')
      .objectStore(SNAP_STORE)
      .get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function writeHistory(db: IDBDatabase, id: string, list: Snapshot[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SNAP_STORE, 'readwrite');
    tx.objectStore(SNAP_STORE).put(list, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function snapList(id: string): Promise<Snapshot[]> {
  return toHistory(await readHistory(await openSnapDb(), id));
}

async function snapGet(id: string): Promise<Snapshot | null> {
  return (await snapList(id))[0] ?? null;
}

// Without force the head is rewritten for 60s and the tail grows one entry a
// minute — a 15s snapshot timer costs a 10-point trail, not 10 writes.
async function snapPut(s: Snapshot, force = false): Promise<void> {
  const db = await openSnapDb();
  const prev = toHistory(await readHistory(db, s.id));
  const head = prev[0];
  const list =
    !force && head != null && s.savedAt - head.savedAt < SNAP_SPACING_MS
      ? [s, ...prev.slice(1)]
      : [s, ...prev];
  await writeHistory(db, s.id, list.slice(0, MAX_SNAPS));
}

// Boot reads the head, so promoting an older point + reload restores it.
async function snapPromote(id: string, savedAt: number): Promise<boolean> {
  const db = await openSnapDb();
  const list = toHistory(await readHistory(db, id));
  const pick = list.find((s) => s.savedAt === savedAt);
  if (pick == null) return false;
  await writeHistory(db, id, [pick, ...list.filter((s) => s.savedAt !== savedAt)]);
  return true;
}

async function snapDelete(id: string): Promise<void> {
  const db = await openSnapDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SNAP_STORE, 'readwrite');
    tx.objectStore(SNAP_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Provider files are the last *registered* content, so edited-but-unsaved text
// only exists in the open editor models. Overlay those on top.
async function snapshotFiles(): Promise<FileMap> {
  const out = await collectFiles();
  for (const d of vscode.workspace.textDocuments) {
    const p = d.uri.path;
    if (!p.startsWith('/workspace/')) continue;
    out[p.slice('/workspace/'.length)] = d.getText();
  }
  return out;
}

let snapTimer: number | null = null;
// Set just before a deliberate reload: the live files are about to be replaced
// by an older snapshot, and the beforeunload tick would otherwise persist them
// straight back over that choice.
let snapFrozen = false;

function persistSnapshot(): void {
  if (provider == null || snapFrozen) return;
  snapshotFiles()
    .then((files) =>
      snapPut({ id: snapKey(), title: projectTitle, files, savedAt: Date.now() })
    )
    .catch(() => {});
}

export function startSnapshotWatcher(): void {
  if (snapTimer != null) return;
  snapTimer = window.setInterval(persistSnapshot, 15000);
  window.addEventListener('beforeunload', persistSnapshot);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') persistSnapshot();
  });
}

const GUEST_HINT = 'cudic_guest_hint';

function agoLabel(ts: number): string {
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return 'just now';
  return mins === 1 ? '1 minute ago' : mins + ' minutes ago';
}

async function restoreSnapshot(): Promise<void> {
  const id = snapKey();
  const list = await snapList(id).catch(() => []);
  if (list.length === 0) {
    vscode.window.showInformationMessage('Cudic: no restore points for this project yet.');
    return;
  }
  const pick = await vscode.window.showQuickPick(
    list.map((s) => ({
      label: agoLabel(s.savedAt),
      description: Object.keys(s.files).length + ' files',
      savedAt: s.savedAt
    })),
    {
      title: 'Restore a previous version',
      placeHolder: 'Where you are now is kept as the next entry back'
    }
  );
  if (pick == null) return;
  // Record the state being left behind, so restoring is itself undoable.
  await snapPut(
    { id, title: projectTitle, files: await snapshotFiles(), savedAt: Date.now() },
    true
  ).catch(() => {});
  if (!(await snapPromote(id, pick.savedAt).catch(() => false))) return;
  // Boot prefers the snapshot head, so reloading is the whole restore.
  snapFrozen = true;
  location.reload();
}

async function setPublished(pub: boolean): Promise<void> {
  const token = getToken();
  if (token == null) {
    vscode.window.showWarningMessage('Sign in to publish projects.');
    return;
  }
  if (projectId == null) {
    vscode.window.showWarningMessage('Save the project first, then publish.');
    return;
  }
  const base = await apiBase();
  try {
    const res = await fetch(base + '/api/games/' + encodeURIComponent(projectId), {
      method: 'PUT',
      headers: headers(true),
      body: JSON.stringify({ published: pub })
    });
    const d = await res.json();
    if (d?.error != null && d.game == null) throw new Error(d.error);
    vscode.window.showInformationMessage(
      pub ? 'Cudic: Published "' + projectTitle + '"' : 'Cudic: Unpublished (back to draft).'
    );
  } catch (e) {
    vscode.window.showErrorMessage('Publish failed: ' + (e as Error).message);
  }
}

async function putThumbnail(value: string | null): Promise<void> {
  const base = await apiBase();
  const res = await fetch(base + '/api/games/' + encodeURIComponent(projectId as string), {
    method: 'PUT',
    headers: headers(true),
    body: JSON.stringify({ thumbnail: value })
  });
  const d = await res.json();
  if (d?.error != null && d.game == null) throw new Error(d.error);
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error('Could not read that file.'));
    fr.readAsDataURL(file);
  });
}

// Keep rows small — a phone photo would otherwise be stored at full size.
function shrinkImage(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const max = 1000;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      if (scale === 1) {
        resolve(dataUrl);
        return;
      }
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      const ctx = c.getContext('2d');
      if (ctx == null) {
        resolve(dataUrl);
        return;
      }
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

function pickImageFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    // Left in the document until the dialog resolves so it stays reachable.
    document.body.appendChild(input);
    const done = (f: File | null): void => {
      input.remove();
      resolve(f);
    };
    input.addEventListener('change', () => done(input.files?.[0] ?? null), { once: true });
    input.addEventListener('cancel', () => done(null), { once: true });
    input.click();
  });
}

async function setThumbnail(): Promise<void> {
  const token = getToken();
  if (token == null) {
    vscode.window.showWarningMessage('Sign in to set a thumbnail.');
    return;
  }
  if (projectId == null) {
    vscode.window.showWarningMessage('Save the project first, then set a thumbnail.');
    return;
  }
  const upload = { label: '$(upload) Upload image…', description: 'Choose a cover from your computer' };
  const capture = { label: '$(screen-normal) Capture from preview', description: 'Screenshot what the preview is showing' };
  const clear = { label: '$(clear-all) Remove thumbnail', description: 'Back to the default placeholder' };
  const pick = await vscode.window.showQuickPick([upload, capture, clear], {
    placeHolder: 'Set project thumbnail'
  });
  if (pick == null) return;
  try {
    if (pick.label === upload.label) {
      const file = await pickImageFile();
      if (file == null) return;
      await putThumbnail(await shrinkImage(await readAsDataUrl(file)));
    } else if (pick.label === capture.label) {
      const shot = previewBridge.capture != null ? await previewBridge.capture() : null;
      if (shot == null) {
        vscode.window.showWarningMessage(
          'Nothing to capture yet — open the Preview tab and run it first, or upload an image instead.'
        );
        return;
      }
      if ('error' in shot) {
        vscode.window.showWarningMessage(
          'Thumbnail capture failed: ' + shot.error + '. You can upload an image instead.'
        );
        return;
      }
      await putThumbnail(shot.data);
    } else {
      await putThumbnail(null);
    }
    vscode.window.showInformationMessage('Cudic: Thumbnail saved — it now shows on your gallery card.');
  } catch (e) {
    vscode.window.showErrorMessage('Thumbnail failed: ' + (e as Error).message);
  }
}

async function deleteProject(): Promise<void> {
  const token = getToken();
  if (token == null) {
    vscode.window.showWarningMessage('Sign in to delete projects.');
    return;
  }
  if (projectId == null) {
    vscode.window.showWarningMessage('Nothing to delete — this project was never saved.');
    return;
  }
  const pick = await vscode.window.showWarningMessage(
    'Delete "' + projectTitle + '" from Cudic? This cannot be undone.',
    { modal: true },
    'Delete'
  );
  if (pick !== 'Delete') return;
  const base = await apiBase();
  try {
    const res = await fetch(base + '/api/games/' + encodeURIComponent(projectId), {
      method: 'DELETE',
      headers: headers(false)
    });
    const d = await res.json().catch(() => ({}));
    if (d?.error != null && !d.ok) throw new Error(d.error);
    projectId = null;
    history.replaceState({}, '', '/studio');
    vscode.window.showInformationMessage('Cudic: Deleted "' + projectTitle + '".');
  } catch (e) {
    vscode.window.showErrorMessage('Delete failed: ' + (e as Error).message);
  }
}

async function saveProject(): Promise<void> {
  const token = getToken();
  if (token == null) {
    const pick = await vscode.window.showWarningMessage(
      'Sign in to save projects to Cudic. Until then this project lives in this browser only.',
      'Export .zip',
      'Sign in'
    );
    if (pick === 'Export .zip') await vscode.commands.executeCommand('glox.exportProject');
    else if (pick === 'Sign in') window.open('/login', '_blank');
    return;
  }
  const files = await collectFiles();
  const text: Record<string, string> = {};
  const bins: Array<[string, Uint8Array]> = [];
  const isScratch = !!files['assets.js'] && /__SCRATCH_ASSETS__/.test(String(files['assets.js']));
  for (const [k, v] of Object.entries(files)) {
    if (typeof v === 'string') {
      // Scratch projects: project.json goes to storage (not the game row) when
      // large, so huge Scratch games can be saved without hitting the body cap.
      if (k === 'project.json' && isScratch && v.length > 500_000) {
        bins.push([k, new TextEncoder().encode(v)]);
      } else {
        text[k] = v;
      }
    } else {
      bins.push([k, v]);
    }
  }
  const base = await apiBase();
  const cfg = await getCfg();
  try {
    let id = projectId;
    const wasNew = id == null;
    if (id == null) {
      const res = await fetch(base + '/api/games', {
        method: 'POST',
        headers: headers(true),
        body: JSON.stringify({ title: projectTitle, files: text })
      });
      const d = await res.json();
      if (d?.game == null) throw new Error(d?.error ?? 'Save failed');
      id = d.game.id;
      projectId = id;
      history.replaceState({}, '', '/studio?id=' + encodeURIComponent(id));
    }
    const assets: Record<string, string> = {};
    for (const [path, bytes] of bins) {
      const sp = id + '/' + path;
      await uploadAsset(cfg, token, sp, bytes, mimeOf(path));
      assets[path] = 'game-assets/' + sp;
    }
    const res = await fetch(base + '/api/games/' + encodeURIComponent(id), {
      method: 'PUT',
      headers: headers(true),
      body: JSON.stringify({ title: projectTitle, files: text, assets })
    });
    const d = await res.json();
    if (d?.error != null && d.game == null) throw new Error(d.error);
    vscode.window.showInformationMessage(
      'Cudic: Saved "' + projectTitle + '"' +
      (bins.length > 0 ? ' (' + bins.length + ' asset(s)).' : '')
    );
    // The work is safely in the backend now — drop the local copy so it can't
    // clobber a newer published version on the next load.
    if (wasNew) await snapDelete('draft').catch(() => {});
    await snapDelete(id).catch(() => {});
  } catch (e) {
    vscode.window.showErrorMessage('Save failed: ' + (e as Error).message);
  }
}

// Memory FS + JSON both punish blobs — skip files past the budget, say so.
const MAX_IMPORT_BYTES = 25 * 1024 * 1024;

// Null/control bytes in the first 8k → binary (UTF-16 text misreads; accepted).
function sniffBinary(buf: Uint8Array): boolean {
  const n = Math.min(buf.length, 8192);
  for (let i = 0; i < n; i++) {
    const b = buf[i];
    if (b === 0 || b < 9 || (b > 13 && b < 32)) return true;
  }
  return false;
}

async function readPickedFile(f: File): Promise<FileContent> {
  const buf = new Uint8Array(await f.arrayBuffer());
  return sniffBinary(buf) ? buf : new TextDecoder().decode(buf);
}

function pickKey(f: File): string {
  if (f.webkitRelativePath) {
    const parts = f.webkitRelativePath.split('/');
    parts.shift();
    if (parts.join('/') !== '') return parts.join('/');
  }
  return f.name;
}

function pickInput(multiple: boolean, webkitdirectory = false): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = multiple;
    // Must be rendered (display:none inputs get their dialog blocked) but invisible.
    input.style.cssText =
      'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;';
    if (webkitdirectory) {
      input.setAttribute('webkitdirectory', '');
      input.setAttribute('directory', '');
    }
    document.body.append(input);
    const done = (files: File[]) => {
      input.remove();
      resolve(files);
    };
    input.onchange = () => done(Array.from(input.files ?? []));
    input.oncancel = () => done([]);
    input.click();
  });
}

async function importIntoWorkspace(): Promise<void> {
  if (provider == null) {
    vscode.window.showErrorMessage('Import failed: workspace not ready, reload Studio.');
    return;
  }
  const files = await pickInput(true);
  if (files.length === 0) return;
  try {
    const incoming: FileMap = {};
    let budget = MAX_IMPORT_BYTES;
    let skipped = 0;
    for (const f of files) {
      if (f.size > budget) {
        skipped++;
        continue;
      }
      budget -= f.size;
      incoming[pickKey(f)] = await readPickedFile(f);
    }
    if (Object.keys(incoming).length === 0) {
      vscode.window.showWarningMessage('Nothing imported' + (skipped > 0 ? ' (' + skipped + ' over 25MB skipped).' : '.'));
      return;
    }
    // Merge over existing project files
    const existing = await collectFiles();
    registerFiles({ ...existing, ...incoming });
    const first = incoming['index.html'] != null
      ? 'index.html'
      : Object.keys(incoming)[0];
    void vscode.commands.executeCommand(
      'vscode.open',
      monaco.Uri.file('/workspace/' + first)
    );
    vscode.window.showInformationMessage(
      'Imported ' + Object.keys(incoming).length + ' file(s).' +
      (skipped > 0 ? ' ' + skipped + ' over 25MB skipped.' : '') +
      ' Save to keep them on Cudic.'
    );
  } catch (e) {
    vscode.window.showErrorMessage('Import failed: ' + (e as Error).message);
  }
}

async function importFolder(): Promise<void> {
  if (provider == null) return;
  const files = await pickInput(true, true);
  if (files.length === 0) return;
  try {
    const incoming: FileMap = {};
    let budget = MAX_IMPORT_BYTES;
    let skipped = 0;
    for (const f of files) {
      if (f.size > budget) {
        skipped++;
        continue;
      }
      budget -= f.size;
      incoming[pickKey(f)] = await readPickedFile(f);
    }
    if (Object.keys(incoming).length === 0) {
      vscode.window.showWarningMessage('Nothing imported from that folder' + (skipped > 0 ? ' (' + skipped + ' over 25MB skipped).' : '.'));
      return;
    }
    const existing = await collectFiles();
    registerFiles({ ...existing, ...incoming });
    const first = incoming['index.html'] != null
      ? 'index.html'
      : Object.keys(incoming)[0];
    void vscode.commands.executeCommand(
      'vscode.open',
      monaco.Uri.file('/workspace/' + first)
    );
    vscode.window.showInformationMessage(
      'Imported folder (' + Object.keys(incoming).length + ' files).' +
      (skipped > 0 ? ' ' + skipped + ' over 25MB skipped.' : '') +
      ' Save to keep them on Cudic.'
    );
  } catch (e) {
    vscode.window.showErrorMessage('Import failed: ' + (e as Error).message);
  }
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

interface ScratchImportResult {
  files?: FileMap;
  binaries?: Record<string, string>;
  warnings?: string[];
  meta?: { sprites: number; assets: number };
  error?: string;
}

// Kenney asset library (CC0, fetched from upstream at runtime). Copies the
// picked file into the project as a binary — it goes to storage on save, same
// as any imported file — drops an <img> at the cursor for images, and for .glb
// models just lands the file (import three.js in your code to use it).
type KenneyPick = vscode.QuickPickItem & { path: string; isModel: boolean };
function humanBytes(n: number): string {
  return n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(0) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
}
async function insertIcon(): Promise<void> {
  if (provider == null) {
    vscode.window.showErrorMessage('Assets need a ready workspace, reload Studio.');
    return;
  }
  let assets: KenneyAsset[];
  try {
    assets = await kenneyAssets();
  } catch (e) {
    vscode.window.showErrorMessage('Could not load the Kenney library: ' + (e as Error).message);
    return;
  }
  const toItem = (a: KenneyAsset): KenneyPick => ({
    label: a.desc,
    description: a.pack,
    detail: a.size + ' · ' + humanBytes(a.bytes),
    path: a.path,
    isModel: a.pack === '3d'
  });
  const qp = vscode.window.createQuickPick<KenneyPick>();
  qp.placeholder = 'Search all Kenney images and 3D models';
  qp.matchOnDescription = true;
  qp.matchOnDetail = true;
  const search = (q: string): KenneyPick[] => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    return assets
      .filter(a => {
        const hay = (a.path + ' ' + a.desc + ' ' + a.pack + ' ' + a.size).toLowerCase();
        return terms.every(t => hay.includes(t));
      })
      .sort((a, b) => {
        const rank = (x: KenneyAsset) =>
          (x.desc.toLowerCase().includes(q) ? 2 : 0) + (x.pack.toLowerCase().includes(q) ? 1 : 0);
        return rank(b) - rank(a);
      })
      .slice(0, 50)
      .map(toItem);
  };
  qp.items = search('');
  qp.onDidChangeValue(v => { qp.items = search(v); });
  const pick = await new Promise<KenneyPick | undefined>(resolve => {
    qp.onDidAccept(() => resolve(qp.selectedItems[0]));
    qp.onDidHide(() => resolve(undefined));
    qp.show();
  });
  qp.dispose();
  if (pick == null) return;
  // Keep the upstream subpath (2d/3d/icons/ui + folders) so e.g. light and dark
  // pawns don't overwrite each other in the project.
  const rel = 'assets/kenney/' + pick.path;
  try {
    const res = await fetch(kenneyUrl(pick.path), { cache: 'no-store' });
    if (!res.ok) throw new Error('could not fetch the file (' + res.status + ')');
    const bytes = new Uint8Array(await res.arrayBuffer());
    registerFiles({ ...(await collectFiles()), [rel]: bytes });
    if (pick.isModel) {
      vscode.window.showInformationMessage('Added ' + rel + '. Import three.js in your code to use it.');
      return;
    }
    const ed = vscode.window.activeTextEditor;
    if (ed != null) {
      await ed.edit((b) => b.replace(ed.selection, '<img src="' + rel + '" alt="' + pick.label + '" width="64" height="64">'));
    }
    vscode.window.showInformationMessage('Added ' + rel + '. Save to publish it with your game.');
  } catch (e) {
    vscode.window.showErrorMessage('Could not add that asset: ' + (e as Error).message);
  }
}

// Unpacks an .sb3 (or shared Scratch project) on the server and drops the
// result into the workspace: index.html + scratch.js + project.json + assets.js.
// project.json is the editable source; scratch.js is the Scaffolding loader.
async function importScratch(): Promise<void> {
  if (provider == null) {
    vscode.window.showErrorMessage('Scratch import needs a ready workspace, reload Studio.');
    return;
  }
  const how = await vscode.window.showQuickPick(
    [
      { label: 'File', desc: 'Pick a .sb3 you downloaded from Scratch' },
      { label: 'Link or id', desc: 'Paste a shared scratch.mit.edu project link' }
    ],
    { placeHolder: 'Import a Scratch project' }
  );
  if (how == null) return;

  const body: Record<string, string> = {};
  if (how.label === 'File') {
    const f = (await pickInput(false))[0];
    if (f == null) return;
    if (!/\.sb3$/i.test(f.name)) {
      vscode.window.showWarningMessage('Pick a Scratch .sb3 file.');
      return;
    }
    if (f.size > MAX_IMPORT_BYTES) {
      vscode.window.showWarningMessage('That file is over 25MB.');
      return;
    }
    body.sb3 = toBase64(new Uint8Array(await f.arrayBuffer()));
    body.title = f.name.replace(/\.sb3$/i, '');
  } else {
    const link = await vscode.window.showInputBox({
      prompt: 'Scratch project link or id',
      placeHolder: 'https://scratch.mit.edu/projects/123456789',
      validateInput: (v) => (v.trim() === '' ? 'Give a link or a project id.' : null)
    });
    if (link == null) return;
    const t = link.trim();
    if (/^\d+$/.test(t)) body.scratchId = t;
    else body.scratchUrl = t;
    const ok = await vscode.window.showWarningMessage(
      'Only import projects you may remix — your own, or one marked "See inside".',
      { modal: true },
      'I have the right to use this'
    );
    if (ok == null) return;
  }

  try {
    const d = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Importing Scratch project…' },
      async (): Promise<ScratchImportResult> => {
        const res = await fetch((await apiBase()) + '/api/scratch/import', {
          method: 'POST',
          headers: headers(true),
          body: JSON.stringify(body)
        });
        const j = (await res.json().catch(() => null)) as ScratchImportResult | null;
        if (j?.files == null) throw new Error(j?.error ?? 'Import failed (' + res.status + ').');
        return j;
      }
    );
    // Assets arrive base64-encoded so they land as real binary files and go to
    // storage on save — never as one giant text file.
    const incoming: FileMap = { ...(d.files ?? {}) };
    for (const [p, b64] of Object.entries(d.binaries ?? {})) incoming[p] = fromBase64(b64);
    registerFiles({ ...(await collectFiles()), ...incoming });
    void vscode.commands.executeCommand('vscode.open', monaco.Uri.file('/workspace/index.html'));
    const notes = (d.warnings ?? []).join(' ');
    vscode.window.showInformationMessage(
      'Imported ' + (d.meta?.sprites ?? 0) + ' sprite(s) and ' + (d.meta?.assets ?? 0) + ' asset(s).' +
      (notes === '' ? '' : ' ' + notes) +
      ' Save to keep it on Cudic.'
    );
  } catch (e) {
    vscode.window.showErrorMessage('Scratch import failed: ' + (e as Error).message);
  }
}

async function exportProject(): Promise<void> {
  try {
    const files = await collectFiles();
    const zip = new JSZip();
    for (const [path, content] of Object.entries(files)) zip.file(path, content);
    const blob = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (projectTitle.replace(/[^a-zA-Z0-9-_]/g, '') || 'project') + '.zip';
    // Detached anchors lose the download filename — must live in the DOM.
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    vscode.window.showInformationMessage('Exported "' + projectTitle + '.zip"');
  } catch (e) {
    vscode.window.showErrorMessage('Export failed: ' + (e as Error).message);
  }
}

export function registerProjectCommands(): void {
  registerAction2(
    class extends Action2 {
      constructor() {
        super({
          id: 'glox.saveProject',
          title: { value: 'Cudic: Save project', original: 'Cudic: Save project' },
          menu: [
            { id: MenuId.CommandPalette },
            { id: MenuId.MenubarFileMenu, group: '5_glox' },
            { id: MenuId.EditorContext, group: 'cudic' }
          ]
        });
      }
      async run(): Promise<void> {
        await saveProject();
      }
    }
  );

  registerAction2(
    class extends Action2 {
      constructor() {
        super({
          id: 'glox.restoreSnapshot',
          title: {
            value: 'Cudic: Restore a previous version',
            original: 'Cudic: Restore a previous version'
          },
          menu: [
            { id: MenuId.CommandPalette },
            { id: MenuId.MenubarFileMenu, group: '5_glox' }
          ]
        });
      }
      async run(): Promise<void> {
        await restoreSnapshot();
      }
    }
  );

  registerAction2(
    class extends Action2 {
      constructor() {
        super({
          id: 'glox.setThumbnail',
          title: { value: 'Cudic: Set thumbnail', original: 'Cudic: Set thumbnail' },
          menu: [
            { id: MenuId.CommandPalette },
            { id: MenuId.MenubarFileMenu, group: '5_glox' }
          ]
        });
      }
      async run(): Promise<void> {
        await setThumbnail();
      }
    }
  );

  registerAction2(
    class extends Action2 {
      constructor() {
        super({
          id: 'glox.importFiles',
          title: { value: 'Cudic: Import files', original: 'Cudic: Import files' },
          menu: [
            { id: MenuId.CommandPalette },
            { id: MenuId.MenubarFileMenu, group: '5_glox' },
            { id: MenuId.EditorContext, group: 'cudic' }
          ]
        });
      }
      async run(): Promise<void> {
        await importIntoWorkspace();
      }
    }
  );

  registerAction2(
    class extends Action2 {
      constructor() {
        super({
          id: 'glox.importFolder',
          title: { value: 'Cudic: Import folder', original: 'Cudic: Import folder' },
          menu: [
            { id: MenuId.CommandPalette },
            { id: MenuId.MenubarFileMenu, group: '5_glox' },
            { id: MenuId.EditorContext, group: 'cudic' }
          ]
        });
      }
      async run(): Promise<void> {
        await importFolder();
      }
    }
  );

  registerAction2(
    class extends Action2 {
      constructor() {
        super({
          id: 'glox.insertIcon',
          title: { value: 'Cudic: Insert asset', original: 'Cudic: Insert asset' },
          menu: [
            { id: MenuId.CommandPalette },
            { id: MenuId.MenubarFileMenu, group: '5_glox' }
          ]
        });
      }
      async run(): Promise<void> {
        await insertIcon();
      }
    }
  );

  registerAction2(
    class extends Action2 {
      constructor() {
        super({
          id: 'glox.importScratch',
          title: { value: 'Cudic: Import Scratch project', original: 'Cudic: Import Scratch project' },
          menu: [
            { id: MenuId.CommandPalette },
            { id: MenuId.MenubarFileMenu, group: '5_glox' },
            { id: MenuId.ExplorerContext, group: 'cudic' },
            { id: MenuId.EditorContext, group: 'cudic' }
          ]
        });
      }
      async run(): Promise<void> {
        await importScratch();
      }
    }
  );

  registerAction2(
    class extends Action2 {
      constructor() {
        super({
          id: 'glox.exportProject',
          title: { value: 'Cudic: Export project as zip', original: 'Cudic: Export project as zip' },
          menu: [
            { id: MenuId.CommandPalette },
            { id: MenuId.MenubarFileMenu, group: '5_glox' },
            { id: MenuId.EditorContext, group: 'cudic' }
          ]
        });
      }
      async run(): Promise<void> {
        await exportProject();
      }
    }
  );

  registerAction2(
    class extends Action2 {
      constructor() {
        super({
          id: 'glox.publishProject',
          title: { value: 'Cudic: Publish project', original: 'Cudic: Publish project' },
          menu: [
            { id: MenuId.CommandPalette },
            { id: MenuId.MenubarFileMenu, group: '5_glox' },
            { id: MenuId.EditorContext, group: 'cudic' }
          ]
        });
      }
      async run(): Promise<void> {
        await setPublished(true);
      }
    }
  );

  registerAction2(
    class extends Action2 {
      constructor() {
        super({
          id: 'glox.unpublishProject',
          title: { value: 'Cudic: Unpublish project', original: 'Cudic: Unpublish project' },
          menu: [
            { id: MenuId.CommandPalette },
            { id: MenuId.MenubarFileMenu, group: '5_glox' },
            { id: MenuId.EditorContext, group: 'cudic' }
          ]
        });
      }
      async run(): Promise<void> {
        await setPublished(false);
      }
    }
  );

  registerAction2(
    class extends Action2 {
      constructor() {
        super({
          id: 'glox.deleteProject',
          title: { value: 'Cudic: Delete project', original: 'Cudic: Delete project' },
          menu: [
            { id: MenuId.CommandPalette },
            { id: MenuId.MenubarFileMenu, group: '5_glox' },
            { id: MenuId.EditorContext, group: 'cudic' }
          ]
        });
      }
      async run(): Promise<void> {
        await deleteProject();
      }
    }
  );

  // A signed-out builder has no way to know their project lives only in this
  // browser until a save fails. Say it once, with the two exits that work.
  try {
    if (getToken() == null && localStorage.getItem(GUEST_HINT) == null) {
      localStorage.setItem(GUEST_HINT, '1');
      void vscode.window
        .showInformationMessage(
          'You are not signed in — this project is saved in this browser only.',
          'Export .zip',
          'Sign in'
        )
        .then((pick) => {
          if (pick === 'Export .zip') void vscode.commands.executeCommand('glox.exportProject');
          else if (pick === 'Sign in') window.open('/login', '_blank');
        });
    }
  } catch {
    // private mode etc. — non-fatal
  }
}
