// Build-time prerender: crawlable landing pages for published games.
//
// Vercel frontend is static output, so /view.html?id=… renders nothing for
// crawlers. This script writes plain HTML for every published game into
// public/game/<id>/index.html (plus a fresh sitemap.xml). The files live only
// in the build output — public/game/ is gitignored, so nothing new lands in
// the repo.
//
// Real data check (2026-10-22): the anon key CAN read published games rows via
// REST, but users rows are RLS-blocked for anon (the author embed comes back
// null), so author names come from Render's public /api/games (service-side
// join, 50 newest) merged in by id. If Render is asleep or unreachable the
// pages still build — they just say "A Cudic creator". All failures are
// non-fatal: the deploy still ships, with the previous static sitemap intact.

import { readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const SITE = 'https://cudic.vercel.app';
const RENDER = 'https://glox-o7rr.onrender.com';

const PUB = new URL('../public', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const GAME_DIR = join(PUB, 'game');
const LIMIT = 400;

function log(m) { console.log('[prerender-games] ' + m); }

function readConfig() {
  const src = readFileSync(join(PUB, 'config.js'), 'utf8');
  const url = /SUPABASE_URL\s*=\s*['"]([^'"]+)/.exec(src)?.[1] ?? '';
  const an = /SUPABASE_ANON_KEY\s*=\s*['"]([^'"]+)/.exec(src)?.[1] ?? '';
  if (!url || !an || an.length < 20) throw new Error('SUPABASE_URL / ANON_KEY not found in config.js');
  return { url: url.replace(/\/$/, ''), anon: an };
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

function escapeXml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
  }[c]));
}

async function fetchGames(cfg) {
  const qs = '?select=id,title,description,credits,tags,play_count,updated_at,created_at&published=eq.true&order=updated_at.desc&limit=' + LIMIT;
  const res = await fetch(cfg.url + '/rest/v1/games' + qs, {
    headers: { apikey: cfg.anon, Authorization: 'Bearer ' + cfg.anon },
    signal: AbortSignal.timeout(30000)
  });
  if (!res.ok) throw new Error('games query ' + res.status + ': ' + (await res.text()).slice(0, 200));
  return await res.json();
}

// Author names are not readable with the anon key (users RLS is locked down),
// so they come from the public Render API — newest 50 — merged in by game id.
async function fetchAuthors() {
  const res = await fetch(RENDER + '/api/games', { signal: AbortSignal.timeout(90000) });
  if (!res.ok) throw new Error('render api ' + res.status);
  const body = await res.json();
  const list = Array.isArray(body) ? body : body.games || [];
  const names = {};
  for (const g of list) {
    const n = g && g.users && g.users.display_name;
    if (g && g.id && typeof n === 'string' && n) names[g.id] = n;
  }
  return names;
}

function relatedFor(g, games) {
  // Same tag first, newest others to fill — an internal link trail that
  // crawlers can follow between game pages.
  const pool = games.filter((x) => x && x.id && x.id !== g.id && /^[0-9a-f-]{36}$/i.test(x.id || ''));
  const tags = new Set((g.tags || []).filter((t) => typeof t === 'string'));
  const tagged = pool.filter((x) => (x.tags || []).some((t) => tags.has(t)));
  const rel = [];
  const seen = new Set();
  for (const x of [...tagged, ...pool]) {
    if (rel.length >= 4) break;
    if (seen.has(x.id)) continue;
    seen.add(x.id);
    rel.push(x);
  }
  return rel;
}

function gamePage(g, names, games) {
  const title = (g.title || '').trim() || 'Untitled game';
  const author = (names[g.id]) || 'A Cudic creator';
  const desc = (g.description || '').trim();
  const metaDesc = desc
    ? desc.slice(0, 160)
    : ('Play ' + title + ' — a browser game by ' + author + ', made with Cudic Studio.');
  const date = String(g.updated_at || g.created_at || '').slice(0, 10);
  const tags = Array.isArray(g.tags) ? g.tags.filter((t) => typeof t === 'string').slice(0, 6) : [];
  const play = '/view.html?id=' + encodeURIComponent(g.id);
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'VideoGame',
    name: title,
    description: metaDesc,
    author: { '@type': 'Person', name: author },
    datePublished: date || undefined,
    url: SITE + '/game/' + g.id + '/',
    image: SITE + '/g/' + g.id + '/thumb',
    genre: tags.length ? tags : undefined,
    applicationCategory: 'Game',
    operatingSystem: 'Web'
  });
  const relHtml = relatedFor(g, games).map((x) => {
    const t = (x.title || '').trim() || 'Untitled game';
    const a2 = names[x.id] || 'A Cudic creator';
    return '<li><a href="' + SITE + '/game/' + x.id + '/">' + esc(t) + ' <small>by ' + esc(a2) + '</small></a></li>';
  }).join('');
  const relBlock = relHtml ? '<section class="related"><h2>You might also like</h2><ul>' + relHtml + '</ul></section>' : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)} — a Cudic game</title>
<meta name="description" content="${esc(metaDesc)}">
<link rel="canonical" content="${SITE}/game/${g.id}/">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Cudic">
<meta property="og:title" content="${esc(title)} — a Cudic game">
<meta property="og:description" content="${esc(metaDesc)}">
<meta property="og:url" content="${SITE}/game/${g.id}/">
<meta property="og:image" content="${SITE}/g/${g.id}/thumb">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)} — a Cudic game">
<meta name="twitter:description" content="${esc(metaDesc)}">
<meta name="twitter:image" content="${SITE}/g/${g.id}/thumb">
<link rel="icon" type="image/svg+xml" href="/cudic_sfsvg.svg">
<script type="application/ld+json">${jsonLd}</script>
<style>
  :root { color-scheme: dark; font-family: system-ui, -apple-system, sans-serif; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; background: #0d0e10; color: #e9edf5;
    display: grid; place-items: center; padding: 32px 20px; }
  main { width: min(720px, 100%); }
  .crumb { color: #7b8394; font-size: 13px; margin-bottom: 22px; }
  .crumb a { color: #7b8394; text-decoration: none; }
  .crumb a:hover { color: #a5b0c5; }
  .shot { border: 1px solid #26272d; border-radius: 14px; overflow: hidden;
    background: #131418; margin-bottom: 22px; }
  .shot img { display: block; width: 100%; aspect-ratio: 16 / 9; object-fit: cover; }
  h1 { font-size: clamp(1.9rem, 5vw, 2.7rem); line-height: 1.08; margin: 0 0 8px; letter-spacing: -0.02em; }
  .by { color: #9aa3b5; margin: 0 0 6px; font-size: 15px; }
  .by a { color: #a5b0c5; }
  .tags { margin: 10px 0 0; display: flex; flex-wrap: wrap; gap: 6px; }
  .tags span { font-size: 12px; padding: 3px 10px; border-radius: 99px;
    background: #181a1f; border: 1px solid #26272d; color: #a5b0c5; }
  .desc { color: #c3cad8; line-height: 1.65; font-size: 15.5px; margin: 14px 0 0; }
  .cta { display: inline-flex; align-items: center; gap: 8px; margin-top: 22px;
    background: #7300ff; color: #fff; text-decoration: none; font-weight: 700;
    padding: 14px 26px; border-radius: 12px; font-size: 16px; }
  .cta:hover { background: #7d1aff; }
  .cta small { font-weight: 400; opacity: .8; }
  .related { margin-top: 30px; }
  .related h2 { font-size: 17px; margin: 0 0 12px; letter-spacing: -0.01em; }
  .related ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
  .related a { display: block; color: #c3cad8; text-decoration: none; font-size: 15px;
    padding: 10px 14px; border: 1px solid #23242a; border-radius: 10px; background: #131418; }
  .related a:hover { border-color: #3a3d47; }
  .related a small { color: #7b8394; }
  footer { margin-top: 34px; padding-top: 18px; border-top: 1px solid #23242a;
    color: #8a92a3; font-size: 13.5px; line-height: 1.6; }
  footer a { color: #a98bff; text-decoration: none; }
  footer a:hover { text-decoration: underline; }
</style>
</head>
<body>
<main>
  <nav class="crumb"><a href="/">Cudic</a> → <a href="/games">Games</a> → ${esc(title)}</nav>
  <div class="shot"><img src="/g/${g.id}/thumb" alt="${esc(title)} cover art"
    onerror="this.replaceWith(document.createTextNode(''))"></div>
  <h1>${esc(title)}</h1>
  <p class="by">by ${esc(author)}${date ? ' · updated ' + esc(date) : ''}${g.play_count > 0 ? ' · ' + g.play_count + ' plays' : ''}</p>
  ${tags.length ? '<div class="tags">' + tags.map((t) => '<span>' + esc(t) + '</span>').join('') + '</div>' : ''}
  ${desc ? '<p class="desc">' + esc(desc) + '</p>' : ''}
  <a class="cta" href="${play}" rel="nofollow">▶ Play ${esc(title)} <small>opens in the player</small></a>
  ${relBlock}
  <footer>${esc(title)} is a browser game — it opens right in the page, nothing to install.
    Made in <a href="/studio">Cudic Studio</a>: fork it there and make it yours.
    Looking for more? Browse the <a href="/games">community gallery</a>.</footer>
</main>
</body>
</html>
`;
}

const CORE = [
  ['/', 'daily', '1.0'],
  ['/games', 'daily', '0.9'],
  ['/studio', 'weekly', '0.9'],
  ['/cookbook/', 'weekly', '0.8'],
  ['/cookbook/platformer.html', 'monthly', '0.7'],
  ['/cookbook/clicker.html', 'monthly', '0.7'],
  ['/cookbook/canvas-art.html', 'monthly', '0.7'],
  ['/cookbook/cloud-saves.html', 'monthly', '0.7'],
  ['/cookbook/multiplayer.html', 'monthly', '0.7'],
  ['/docs', 'weekly', '0.6'],
  ['/editor', 'weekly', '0.7'],
  ['/chat', 'daily', '0.7'],
  ['/servers', 'daily', '0.6'],
  ['/themes', 'weekly', '0.6'],
  ['/music', 'weekly', '0.7'],
  ['/login', 'monthly', '0.5'],
  ['/privacy', 'yearly', '0.3'],
  ['/terms', 'yearly', '0.3'],
  ['/profile', 'monthly', '0.3'],
];

function sitemap(games) {
  const urls = CORE.map(([path, freq, pri]) =>
    '  <url><loc>' + SITE + path + '</loc><changefreq>' + freq + '</changefreq><priority>' + pri + '</priority></url>');
  for (const g of games) {
    const d = String(g.updated_at || g.created_at || '').slice(0, 10);
    urls.push('  <url><loc>' + SITE + '/game/' + g.id + '/</loc>' +
      (d ? '<lastmod>' + d + '</lastmod>' : '') +
      '<changefreq>weekly</changefreq><priority>0.8</priority></url>');
  }
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.join('\n') + '\n</urlset>\n';
}

try {
  const cfg = readConfig();
  const games = await fetchGames(cfg);
  log('fetched ' + games.length + ' published games');
  let names = {};
  try {
    names = await fetchAuthors();
    log('authors merged from Render API (' + Object.keys(names).length + ' named)');
  } catch (e) {
    log('author lookup skipped — ' + (e && e.message ? e.message : e));
  }
  rmSync(GAME_DIR, { recursive: true, force: true });
  mkdirSync(GAME_DIR, { recursive: true });
  for (const g of games) {
    if (!g || !/^[0-9a-f-]{36}$/i.test(g.id)) continue;
    mkdirSync(join(GAME_DIR, g.id), { recursive: true });
    writeFileSync(join(GAME_DIR, g.id, 'index.html'), gamePage(g, names, games));
  }
  writeFileSync(join(PUB, 'sitemap.xml'), sitemap(games));
  log('wrote ' + games.length + ' game pages + sitemap (' + (CORE.length + games.length) + ' URLs)');
} catch (e) {
  log('SKIPPED — ' + (e && e.message ? e.message : e));
}
process.exit(0);
