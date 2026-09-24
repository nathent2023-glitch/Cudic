// Glox built-ins — core UI, no vsix, cannot be uninstalled.
// Preview is a real editor tab (same as index.html). No sidebar container.
import * as vscode from 'vscode';
import {
  registerEditorPane,
  registerEditor,
  registerEditorSerializer,
  SimpleEditorPane,
  SimpleEditorInput,
  RegisteredEditorPriority,
  Parts,
  setPartVisibility,
  isPartVisibile
} from '@codingame/monaco-vscode-workbench-service-override';
import type {
  EditorInput,
  IEditorGroup,
  IInstantiationService
} from '@codingame/monaco-vscode-api';
import * as monaco from 'monaco-editor';
import {
  registerAction2,
  Action2,
  MenuId
} from '@codingame/monaco-vscode-api/vscode/vs/platform/actions/common/actions';
import { mimeOf, collectBinaryFiles, collectTextFiles } from './project';
import mammoth from 'mammoth';

const BTN =
  'background:#774DCB;color:#fff;border:none;border-radius:6px;padding:6px 14px;font-size:12px;cursor:pointer;';
const GHOST_BTN =
  'background:transparent;color:#c9d4ff;border:1px solid #3a4670;border-radius:6px;padding:6px 14px;font-size:12px;cursor:pointer;';

function el(html: string): HTMLElement {
  const t = document.createElement('template');
  t.innerHTML = html;
  return t.content.firstElementChild as HTMLElement;
}
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function normalizeRef(ref: string): string {
  return ref
    .trim()
    .replace(/^\.\//, '')
    .replace(/^\/+/, '')
    .replace(/^workspace\//i, '');
}

// Rewrite relative asset references (src/href/poster/url()) to data: URLs
// of the binary siblings in the workspace — HTML/CSS static refs only;
// paths constructed in JS need absolute game-assets URLs after save.
// data: URLs (not blob:) because the preview iframe is sandboxed without
// allow-same-origin — parent-created blob URLs are blocked there by design.
function toDataUrl(mime: string, bytes: Uint8Array): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(new Blob([bytes as unknown as BlobPart], { type: mime }));
  });
}

async function injectAssetUrls(html: string): Promise<string> {
  const bins = await collectBinaryFiles();
  const keys = Object.keys(bins);
  if (keys.length === 0) return html;
  const data = new Map<string, string>();
  for (const k of keys) {
    data.set(k, await toDataUrl(mimeOf(k), bins[k]));
  }
  const byNorm = new Map(keys.map((k) => [k.toLowerCase(), k]));
  const swap = (raw: string): string => {
    const hit = byNorm.get(normalizeRef(raw).toLowerCase());
    return hit != null ? (data.get(hit) as string) : raw;
  };
  const external = /^(https?:|data:|blob:|#)/i;
  return html
    .replace(/(src|href|poster)\s*=\s*(["'])([^"']+)\2/gi, (m, a, q, ref) => {
      if (external.test(ref)) return m;
      return a + '=' + q + swap(ref) + q;
    })
    .replace(/url\(\s*(["']?)([^)"']+)\1\s*\)/gi, (m, q, ref) => {
      if (external.test(ref)) return m;
      return 'url(' + (q || '') + swap(ref) + (q || '') + ')';
    });
}

function lookupFile(project: Record<string, string>, ref: string): string | null {
  const n = normalizeRef(ref);
  if (project[n] != null) return n;
  const l = n.toLowerCase();
  for (const k of Object.keys(project)) {
    if (k.toLowerCase() === l) return k;
  }
  return null;
}

const REMOTE_REF = /^(https?:|data:|blob:|#|[a-z][a-z0-9+.-]*:|\/\/)/i;

// Preview runs the project: local css/js siblings get inlined, the open
// file's live editor text overlays its slot (no save needed). Remote URLs,
// CDNs and importmaps pass through untouched.
async function assemble(baseHtml: string, selfName: string, selfCode: string): Promise<string> {
  const project = await collectTextFiles();
  const selfLower = selfName.toLowerCase();
  let cssUsed = false;
  let jsUsed = false;
  const sibling = (ref: string, markUsed: () => void): string | null => {
    const hit = lookupFile(project, ref);
    if (hit == null) return null;
    if (hit.toLowerCase() === selfLower) {
      markUsed();
      return selfCode;
    }
    return project[hit];
  };
  let html = baseHtml.replace(
    /<link\b[^>]*rel\s*=\s*(["'])stylesheet\1[^>]*href\s*=\s*(["'])([^"']+)\2[^>]*>/gi,
    (m, _q1, _q2, ref) => {
      if (REMOTE_REF.test(ref)) return m;
      const css = sibling(ref, () => {
        cssUsed = true;
      });
      if (css == null) return m;
      return '<style>' + css.replace(/<\/style/gi, '<\\/style') + '</style>';
    }
  );
  html = html.replace(
    /<script\b([^>]*)src\s*=\s*(["'])([^"']+)\2([^>]*)>\s*<\/script\s*>/gi,
    (m, pre, _q, ref, post) => {
      if (REMOTE_REF.test(ref)) return m;
      const js = sibling(ref, () => {
        jsUsed = true;
      });
      if (js == null) return m;
      return (
        '<script' + pre + post + '>' + js.replace(/<\/script/gi, '<\\/script') + '</script>'
      );
    }
  );
  if (/\.css$/i.test(selfName) && !cssUsed) {
    const tag = '<style>' + selfCode.replace(/<\/style/gi, '<\\/style') + '</style>';
    html = /<\/head\s*>/i.test(html) ? html.replace(/<\/head\s*>/i, tag + '</head>') : html + tag;
  }
  if (/\.m?jsx?$/i.test(selfName) && !jsUsed) {
    const tag = '<script>' + selfCode.replace(/<\/script/gi, '<\\/script') + '</script>';
    html = /<\/body\s*>/i.test(html) ? html.replace(/<\/body\s*>/i, tag + '</body>') : html + tag;
  }
  return injectAssetUrls(html);
}

function legacySingle(name: string, code: string): string {
  if (/\.css$/.test(name)) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${code}</style></head><body><h1>style preview</h1></body></html>`;
  }
  if (/\.m?jsx?$/.test(name) || name === 'untitled') {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{background:#0d1021;color:#dbe4ff;font-family:monospace;padding:12px}#err{color:#ff7b7b;white-space:pre-wrap}</style></head><body><div id="out"></div><div id="err"></div><script>
const out=document.getElementById('out'),err=document.getElementById('err');
const show=(v)=>{const d=document.createElement('div');d.textContent=typeof v==='object'?JSON.stringify(v):String(v);out.append(d);};
console.log=(...a)=>a.forEach(show);console.error=(...a)=>{const d=document.createElement('div');d.style.color='#ff7b7b';d.textContent=a.join(' ');err.append(d);};
window.onerror=(m)=>{err.textContent=String(m);};
try{${code}\n}catch(e){err.textContent=String(e&&e.stack||e);}</script></body></html>`;
  }
  return `<!DOCTYPE html><html><body><pre>${esc(code)}</pre></body></html>`;
}

// Preview always runs the project's index.html when one exists.
async function previewHtmlFor(name: string, code: string): Promise<string> {
  if (/\.html?$/.test(name)) return assemble(code, name, code);
  const project = await collectTextFiles();
  const entry = project['index.html'];
  if (entry == null) return legacySingle(name, code);
  if (/\.css$/i.test(name) || /\.m?jsx?$/i.test(name)) return assemble(entry, name, code);
  return assemble(entry, '', '');
}

// Last focused code document — Preview pane has no activeTextEditor when focused.
let lastCodeDoc: vscode.TextDocument | null = null;
// Defer: vscode API isn't ready at module import time (localExtensionHost boots later).
function watchActiveDoc(): void {
  vscode.window.onDidChangeActiveTextEditor((e) => {
    if (e != null && !e.document.fileName.endsWith('.gloxpreview')) {
      lastCodeDoc = e.document;
    }
  });
}
// Try now (if already ready) and again shortly after boot.
try {
  watchActiveDoc();
} catch {
  setTimeout(() => {
    try {
      watchActiveDoc();
    } catch {
      // still not ready; Run will fall back to activeTextEditor
    }
  }, 3000);
}

function targetDoc(): vscode.TextDocument | null {
  const active = vscode.window.activeTextEditor?.document;
  if (active != null && !active.fileName.endsWith('.gloxpreview')) return active;
  return lastCodeDoc;
}

async function readDoc(path: string): Promise<Pick<
  vscode.TextDocument,
  'fileName' | 'getText'
> | null> {
  try {
    const bytes = await vscode.workspace.fs.readFile(monaco.Uri.file(path));
    const text = new TextDecoder().decode(bytes);
    return { fileName: path, getText: () => text };
  } catch {
    return null;
  }
}

async function findFirstFile(dir: string): Promise<string | null> {
  let entries: [string, vscode.FileType][];
  try {
    entries = await vscode.workspace.fs.readDirectory(monaco.Uri.file(dir));
  } catch {
    return null;
  }
  for (const [name, type] of entries) {
    if (name.endsWith('.gloxpreview')) continue;
    if (type === vscode.FileType.File) return dir + '/' + name;
  }
  for (const [name, type] of entries) {
    if (type === vscode.FileType.Directory) {
      const found = await findFirstFile(dir + '/' + name);
      if (found != null) return found;
    }
  }
  return null;
}

// Never index.html-or-bust: prefer it, else first real file in the workspace.
async function fallbackDoc(): Promise<Pick<
  vscode.TextDocument,
  'fileName' | 'getText'
> | null> {
  const atRoot = await readDoc('/workspace/index.html');
  if (atRoot != null) return atRoot;
  const first = await findFirstFile('/workspace');
  if (first != null) return readDoc(first);
  return null;
}

// Seed at boot so first-open Preview works with zero clicks.
export async function seedPreviewDoc(): Promise<void> {
  if (lastCodeDoc != null) return;
  const doc = await fallbackDoc();
  if (doc != null) lastCodeDoc = doc as vscode.TextDocument;
}

export async function gloxRun(): Promise<void> {
  const panes = PreviewPane.livePanes();
  if (panes.length === 0) {
    vscode.window.showErrorMessage('Preview: pane not ready yet, reopen Glox Preview.');
    return;
  }
  let doc = targetDoc();
  if (doc == null) {
    const fb = await fallbackDoc();
    if (fb != null) {
      lastCodeDoc = fb as vscode.TextDocument;
      doc = lastCodeDoc;
    }
  }
  if (doc == null) {
    vscode.window.showWarningMessage('Preview: no file to show. Open a file first, then Run.');
    return;
  }
  const html = await previewHtmlFor(
    doc.fileName.split('/').pop() ?? 'untitled',
    doc.getText()
  );
  panes.forEach((p) => p.showHtml(html));
}

// ---- Preview editor pane (tab) ---------------------------------------------
class PreviewPane extends SimpleEditorPane {
  static readonly ID = 'workbench.editors.gloxPreview';
  private static live = new Set<PreviewPane>();
  private frame: HTMLIFrameElement | null = null;

  constructor(group: IEditorGroup) {
    super(PreviewPane.ID, group);
  }

  static livePanes(): PreviewPane[] {
    for (const p of [...PreviewPane.live]) {
      if (p.frame == null || !p.frame.isConnected) PreviewPane.live.delete(p);
    }
    return [...PreviewPane.live];
  }

  showHtml(html: string): void {
    if (this.frame != null) this.frame.srcdoc = html;
  }

  private async renderDoc(doc: { fileName: string; getText: () => string }): Promise<void> {
    if (this.frame == null) return;
    this.frame.srcdoc = await previewHtmlFor(
      doc.fileName.split('/').pop() ?? 'untitled',
      doc.getText()
    );
  }

  async rerun(): Promise<void> {
    let doc = targetDoc();
    if (doc == null) {
      const fb = await fallbackDoc();
      if (fb != null) {
        lastCodeDoc = fb as vscode.TextDocument;
        doc = lastCodeDoc;
      }
    }
    if (doc == null) {
      vscode.window.showWarningMessage('Preview: no file to show. Open a file first, then Run.');
      return;
    }
    await this.renderDoc(doc);
  }

  initialize(): HTMLElement {
    const wrap = el(
      `<div style="display:flex;flex-direction:column;height:100%;box-sizing:border-box;padding:8px;gap:8px;background:#1e1e2e;"></div>`
    );
    const bar = el(`<div style="display:flex;gap:6px;flex-wrap:wrap;"></div>`);
    const run = el(`<button style="${BTN}">▶ Run</button>`) as HTMLButtonElement;
    const refresh = el(`<button style="${GHOST_BTN}">Refresh</button>`) as HTMLButtonElement;
    const stop = el(`<button style="${GHOST_BTN}">Stop</button>`) as HTMLButtonElement;
    const pop = el(`<button style="${GHOST_BTN}">Open in browser</button>`) as HTMLButtonElement;
    run.onclick = () => {
      void this.rerun();
    };
    refresh.onclick = () => {
      void this.rerun();
    };
    stop.onclick = () => {
      if (this.frame != null) this.frame.srcdoc = '';
    };
    pop.onclick = () => {
      if (this.frame == null || this.frame.srcdoc === '') return;
      const blob = new Blob([this.frame.srcdoc], { type: 'text/html' });
      window.open(URL.createObjectURL(blob), '_blank', 'noopener');
    };
    bar.append(run, refresh, stop, pop);
    this.frame = document.createElement('iframe');
    this.frame.setAttribute('sandbox', 'allow-scripts');
    this.frame.style.cssText = 'flex:1;width:100%;border:none;background:#fff;';
    this.frame.srcdoc = '';
    wrap.append(bar, this.frame);
    PreviewPane.live.add(this);
    return wrap;
  }

  async renderInput(_input: EditorInput): Promise<monaco.IDisposable> {
    PreviewPane.live.add(this);
    await this.rerun();
    return { dispose() {} };
  }
}

class PreviewInput extends SimpleEditorInput {
  constructor(resource?: monaco.Uri) {
    super(resource);
    this.setName('Glox Preview');
  }
  override get typeId(): string {
    return PreviewPane.ID;
  }
  override get editorId(): string {
    return PreviewPane.ID;
  }
}

registerEditorPane(PreviewPane.ID, 'Glox Preview', PreviewPane, [PreviewInput]);

registerEditor(
  '*.gloxpreview',
  {
    id: PreviewPane.ID,
    label: 'Glox Preview',
    priority: {
      diff: RegisteredEditorPriority.default,
      editor: RegisteredEditorPriority.default,
      merge: RegisteredEditorPriority.default
    }
  },
  { singlePerResource: true },
  {
    async createEditorInput(editorInput) {
      return { editor: new PreviewInput(editorInput.resource) };
    }
  }
);

registerEditorSerializer(
  PreviewPane.ID,
  class implements import('@codingame/monaco-vscode-workbench-service-override').IEditorSerializer {
    canSerialize(): boolean {
      return true;
    }
    serialize(): string {
      return JSON.stringify({ resource: 'glox-preview' });
    }
    deserialize(
      instantiationService: IInstantiationService
    ): EditorInput | undefined {
      return instantiationService.createInstance(
        PreviewInput,
        monaco.Uri.parse('file:///workspace/preview.gloxpreview')
      ) as EditorInput;
    }
  }
);

// ---- Binary file viewer (readonly tab) ---------------------------------------
const VIEW_EXTS = [
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico',
  'mp3', 'wav', 'ogg', 'mp4', 'webm',
  'pdf', 'docx', 'pptx', 'xlsx'
];
const VIEW_GLOBS = VIEW_EXTS.map((e) => '*.' + e);
const BINARY_EXT = new RegExp('\\.(' + VIEW_EXTS.join('|') + ')$', 'i');

class ViewerInput extends SimpleEditorInput {
  data: Uint8Array | null = null;
  mime = 'application/octet-stream';
  sourcePath = '';
  constructor(resource?: monaco.Uri) {
    super(resource);
    this.sourcePath = String(resource?.path ?? '');
    this.setName(this.sourcePath.split('/').pop() || 'file');
    this.mime = mimeOf(this.sourcePath);
  }
  override get typeId(): string {
    return ViewerPane.ID;
  }
  override get editorId(): string {
    return ViewerPane.ID;
  }
}

class ViewerPane extends SimpleEditorPane {
  static readonly ID = 'workbench.editors.gloxViewer';
  private body: HTMLElement | null = null;
  private current: ViewerInput | null = null;

  constructor(group: IEditorGroup) {
    super(ViewerPane.ID, group);
  }

  initialize(): HTMLElement {
    const wrap = el(
      `<div style="display:flex;flex-direction:column;height:100%;box-sizing:border-box;padding:8px;gap:8px;background:#1e1e2e;"></div>`
    );
    const bar = el(`<div style="display:flex;gap:6px;flex-wrap:wrap;"></div>`);
    const dl = el(`<button style="${GHOST_BTN}">Download</button>`) as HTMLButtonElement;
    dl.onclick = () => {
      if (this.current?.data == null) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(
        new Blob([this.current.data as unknown as BlobPart], { type: this.current.mime })
      );
      a.download = this.current.sourcePath.split('/').pop() || 'file';
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    };
    const note = el(
      `<span style="color:#8b93b8;font-size:11px;align-self:center;">read-only — re-import to replace</span>`
    );
    bar.append(dl, note);
    this.body = el(
      `<div style="flex:1;overflow:auto;display:flex;flex-direction:column;"></div>`
    );
    wrap.append(bar, this.body);
    return wrap;
  }

  async renderInput(input: EditorInput): Promise<monaco.IDisposable> {
    const v = input as ViewerInput;
    this.current = v;
    const urls: string[] = [];
    if (this.body != null) this.body.replaceChildren();
    try {
      if (v.data == null && v.sourcePath !== '') {
        v.data = await vscode.workspace.fs.readFile(monaco.Uri.file(v.sourcePath));
      }
      if (v.data == null) throw new Error('unreadable');
      const data = v.data;
      const blob = (mime: string) => {
        const u = URL.createObjectURL(
          new Blob([data as unknown as BlobPart], { type: mime })
        );
        urls.push(u);
        return u;
      };
      let node: HTMLElement;
      if (v.mime.startsWith('image/')) {
        const img = el(`<img style="max-width:100%;object-fit:contain;" />`) as HTMLImageElement;
        img.alt = v.sourcePath.split('/').pop() || 'image';
        img.src = blob(v.mime);
        node = img;
      } else if (v.mime.startsWith('audio/')) {
        const a = el(`<audio controls style="width:100%;"></audio>`) as HTMLAudioElement;
        a.src = blob(v.mime);
        node = a;
      } else if (v.mime.startsWith('video/')) {
        const vd = el(
          `<video controls style="max-width:100%;max-height:100%;"></video>`
        ) as HTMLVideoElement;
        vd.src = blob(v.mime);
        node = vd;
      } else if (v.mime === 'application/pdf') {
        const f = el(
          `<iframe style="flex:1;width:100%;border:none;background:#fff;"></iframe>`
        ) as HTMLIFrameElement;
        f.src = blob(v.mime);
        node = f;
      } else if (/\.docx$/i.test(v.sourcePath)) {
        const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
        const { value: html } = await mammoth.convertToHtml({ arrayBuffer: buf });
        node = el(
          `<div style="flex:1;overflow:auto;background:#fff;color:#111;padding:16px;"></div>`
        );
        node.innerHTML = html;
      } else {
        node = el(
          `<div style="color:#c9d4ff;padding:12px;">No inline viewer for this type — use Download, or re-import to replace it.</div>`
        );
      }
      this.body?.append(node);
    } catch {
      this.body?.append(
        el(`<div style="color:#ff7b7b;padding:12px;">Could not load this file.</div>`)
      );
    }
    return {
      dispose() {
        urls.forEach((u) => URL.revokeObjectURL(u));
      }
    };
  }
}

registerEditorPane(ViewerPane.ID, 'Glox Viewer', ViewerPane, [ViewerInput]);

for (const glob of VIEW_GLOBS) {
  registerEditor(
    glob,
    {
      id: ViewerPane.ID,
      label: 'Glox Viewer',
      priority: {
        diff: RegisteredEditorPriority.default,
        editor: RegisteredEditorPriority.default,
        merge: RegisteredEditorPriority.default
      }
    },
    { singlePerResource: true },
    {
      async createEditorInput(editorInput) {
        return { editor: new ViewerInput(editorInput.resource) };
      }
    }
  );
}

registerEditorSerializer(
  ViewerPane.ID,
  class implements import('@codingame/monaco-vscode-workbench-service-override').IEditorSerializer {
    canSerialize(): boolean {
      return true;
    }
    serialize(editorInput: EditorInput): string {
      return JSON.stringify({ resource: (editorInput as ViewerInput).sourcePath });
    }
    deserialize(
      instantiationService: IInstantiationService,
      serialized: string
    ): EditorInput | undefined {
      let path = '/workspace/index.html';
      try {
        path = JSON.parse(serialized).resource || path;
      } catch {
        // keep default
      }
      return instantiationService.createInstance(
        ViewerInput,
        monaco.Uri.file(path)
      ) as EditorInput;
    }
  }
);

export async function openGloxPreview(): Promise<void> {
  // Capture the code file BEFORE focus switches to the Preview pane.
  const active = vscode.window.activeTextEditor?.document;
  if (active != null && !active.fileName.endsWith('.gloxpreview')) {
    lastCodeDoc = active;
  }
  if (lastCodeDoc == null) {
    const fb = await fallbackDoc();
    if (fb != null) {
      lastCodeDoc = fb as vscode.TextDocument;
    } else {
      vscode.window.showWarningMessage('Preview: workspace is empty.');
    }
  }
  await vscode.commands.executeCommand(
    'vscode.open',
    monaco.Uri.parse('file:///workspace/preview.gloxpreview')
  );
  await gloxRun();
}

// ---- Commands ---------------------------------------------------------------
registerAction2(
  class extends Action2 {
    constructor() {
      super({
        id: 'glox.openPreview',
        title: { value: 'Open Glox Preview', original: 'Open Glox Preview' },
        category: 'Glox',
        icon: 'open-preview' as never,
        menu: [
          { id: MenuId.CommandPalette },
          // Right-click editor tab
          { id: MenuId.EditorTitleContext, group: 'navigation', order: 1 },
          // Right-click inside editor
          { id: MenuId.EditorContext, group: 'navigation', order: 1 },
          // Right-click file in Explorer
          { id: MenuId.ExplorerContext, group: 'navigation', order: 1 }
        ]
      });
    }
    async run(_accessor: unknown, resource?: monaco.Uri): Promise<void> {
      // Right-clicked a binary → open in the viewer, not the HTML preview.
      if (resource != null && BINARY_EXT.test(String(resource.path))) {
        await vscode.commands.executeCommand('vscode.open', resource);
        return;
      }
      // Right-clicked a specific file → preview that file.
      if (resource != null && !String(resource.path).endsWith('.gloxpreview')) {
        try {
          const bytes = await vscode.workspace.fs.readFile(resource);
          const text = new TextDecoder().decode(bytes);
          lastCodeDoc = {
            fileName: resource.path,
            getText: () => text
          } as vscode.TextDocument;
        } catch {
          // unreadable; keep previous lastCodeDoc
        }
      }
      await openGloxPreview();
    }
  }
);

registerAction2(
  class extends Action2 {
    constructor() {
      super({
        id: 'glox.run',
        title: { value: 'Glox: Run active file', original: 'Glox: Run active file' },
        category: 'Glox',
        menu: [{ id: MenuId.CommandPalette }]
      });
    }
    async run(): Promise<void> {
        await gloxRun();
    }
  }
);

registerAction2(
  class extends Action2 {
    constructor() {
      super({
        id: 'glox.leaveStudio',
        title: { value: 'Glox: Leave Studio', original: 'Glox: Leave Studio' },
        menu: [
          { id: MenuId.CommandPalette },
          { id: MenuId.MenubarFileMenu, group: '5_glox' }
        ]
      });
    }
    async run(): Promise<void> {
      window.location.href = '/games';
    }
  }
);

registerAction2(
  class extends Action2 {
    constructor() {
      super({
        id: 'glox.toggleSidebar',
        title: { value: 'Glox: Toggle sidebar', original: 'Glox: Toggle sidebar' },
        category: 'Glox',
        menu: [{ id: MenuId.CommandPalette }]
      });
    }
    async run(): Promise<void> {
      setPartVisibility(Parts.SIDEBAR_PART, !isPartVisibile(Parts.SIDEBAR_PART));
    }
  }
);
