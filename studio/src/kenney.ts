// Kenney asset index — fetched at runtime from the upstream repo, never
// committed to this codebase. Swap these to point at your fork: images track
// the branch via raw.githubusercontent, models use the pinned 3d tree SHA.
const KENNEY_BRANCH = 'main';
const KENNEY_TREE = 'cb1ec688eec20806b656cb12e6d47b4592ff9718';

export interface KenneyAsset {
  path: string; // '2d/.../ship1.png' or '3d/blaster/blaster-a.glb'
  pack: string; // top-level dir: 2d | 3d | icons | ui
  desc: string; // index.tsv description, or the .glb file stem
  size: string; // '16×16' for icons, '3D model' for .glb
  bytes: number;
}

/** Raw-URL builder so callers never hand-assemble the pinned path. */
export function kenneyUrl(path: string): string {
  return 'https://raw.githubusercontent.com/shorepine/kenney/' + KENNEY_BRANCH + '/' +
    path.split('/').map(encodeURIComponent).join('/');
}

let loading: Promise<KenneyAsset[]> | null = null;

/** Both indexes, once per session. HTTP cache + pinned URLs cover repeats. */
export function kenneyAssets(): Promise<KenneyAsset[]> {
  if (loading == null) loading = load();
  return loading;
}

async function load(): Promise<KenneyAsset[]> {
  const [images, models] = await Promise.all([loadImages(), loadModels()]);
  return images.concat(models);
}

async function loadImages(): Promise<KenneyAsset[]> {
  const res = await fetch(kenneyUrl('index.tsv'), { cache: 'no-store' });
  if (!res.ok) throw new Error('kenney index ' + res.status);
  const out: KenneyAsset[] = [];
  for (const line of (await res.text()).split('\n').slice(1)) {
    if (!line) continue;
    const [path, desc, size, bytes] = line.split('\t');
    out.push({ path, pack: path.split('/')[0], desc, size, bytes: Number(bytes) || 0 });
  }
  return out;
}

async function loadModels(): Promise<KenneyAsset[]> {
  const res = await fetch('https://api.github.com/repos/shorepine/kenney/git/trees/' + KENNEY_TREE + '?recursive=1', { cache: 'no-store' });
  if (!res.ok) throw new Error('kenney 3d index ' + res.status);
  const j = await res.json();
  const out: KenneyAsset[] = [];
  for (const e of j.tree) {
    if (e.type === 'blob' && e.path.endsWith('.glb')) {
      out.push({
        path: '3d/' + e.path, // tree is rooted at 3d/, paths come back unprefixed
        pack: '3d',
        desc: e.path.split('/').pop().replace(/\.glb$/, ''),
        size: '3D model',
        bytes: e.size || 0
      });
    }
  }
  return out;
}
