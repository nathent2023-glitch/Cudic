// Phase 2 — bridge Explorer ↔ Glox backend (games.files JSON).
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

const DEMO: Record<string, string> = {
  'index.html':
    '<!DOCTYPE html>\n<html>\n<body>\n<h1>Glox Studio shell</h1>\n</body>\n</html>\n',
  'main.js': 'console.log("hello from the workbench");\n'
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

function getToken(): string | null {
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
    const t = await (await fetch('/config.js')).text();
    const m = t.match(/WS_URL\s*=\s*['"]([^'"]+)/);
    if (m != null) return m[1].replace(/^wss?:\/\//, 'https://');
  } catch {
    // same-origin fallback
  }
  return '';
}

function headers(json: boolean): Record<string, string> {
  const h: Record<string, string> = {};
  if (json) h['Content-Type'] = 'application/json';
  const t = getToken();
  if (t != null) h['Authorization'] = 'Bearer ' + t;
  return h;
}

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
    const w = t.match(/WS_URL\s*=\s*['"]([^'"]+)/);
    if (w != null) cfg.api = w[1].replace(/^wss?:\/\//, 'https://');
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
    case 'ico': return 'image/x-icon';
    case 'mp3': return 'audio/mpeg';
    case 'wav': return 'audio/wav';
    case 'ogg':
    case 'oga': return 'audio/ogg';
    case 'mp4': return 'video/mp4';
    case 'webm': return 'video/webm';
    case 'pdf': return 'application/pdf';
    case 'zip': return 'application/zip';
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
  if (projectId != null) {
    try {
      const base = await apiBase();
      const res = await fetch(base + '/api/games/' + encodeURIComponent(projectId));
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
                out[path] = new Uint8Array(await r.arrayBuffer());
              } catch {
                // keep the project loadable without this asset
              }
            }
          }
          return { id: projectId, title: projectTitle, files: out };
        }
      }
    } catch {
      // fall through to demo
    }
  }
  return { id: null, title: projectTitle, files: { ...DEMO } };
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

async function saveProject(): Promise<void> {
  const token = getToken();
  if (token == null) {
    vscode.window.showWarningMessage('Sign in to save projects to Glox.');
    return;
  }
  const files = await collectFiles();
  const text: Record<string, string> = {};
  const bins: Array<[string, Uint8Array]> = [];
  for (const [k, v] of Object.entries(files)) {
    if (typeof v === 'string') text[k] = v;
    else bins.push([k, v]);
  }
  const base = await apiBase();
  const cfg = await getCfg();
  try {
    let id = projectId;
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
      'Glox: Saved "' + projectTitle + '"' +
      (bins.length > 0 ? ' (' + bins.length + ' asset(s)).' : '')
    );
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
      ' Save to keep them on Glox.'
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
      ' Save to keep them on Glox.'
    );
  } catch (e) {
    vscode.window.showErrorMessage('Import failed: ' + (e as Error).message);
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
          title: { value: 'Glox: Save project', original: 'Glox: Save project' },
          menu: [
            { id: MenuId.CommandPalette },
            { id: MenuId.MenubarFileMenu, group: '5_glox' }
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
          id: 'glox.importFiles',
          title: { value: 'Glox: Import files', original: 'Glox: Import files' },
          menu: [
            { id: MenuId.CommandPalette },
            { id: MenuId.MenubarFileMenu, group: '5_glox' }
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
          title: { value: 'Glox: Import folder', original: 'Glox: Import folder' },
          menu: [
            { id: MenuId.CommandPalette },
            { id: MenuId.MenubarFileMenu, group: '5_glox' }
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
          id: 'glox.exportProject',
          title: { value: 'Glox: Export project as zip', original: 'Glox: Export project as zip' },
          menu: [
            { id: MenuId.CommandPalette },
            { id: MenuId.MenubarFileMenu, group: '5_glox' }
          ]
        });
      }
      async run(): Promise<void> {
        await exportProject();
      }
    }
  );
}
