// Prerender: render the app to static HTML and write public/index.html.
// Commits are fetched at build time and baked in; the browser re-fetches live.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const distHtml = resolve(root, '../public/landing-assets/index.html');
const outHtml = resolve(root, '../public/index.html');

async function commits() {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(
      'https://api.github.com/repos/nathent2023-glitch/Cudic/commits?per_page=6',
      { signal: ctrl.signal, headers: { 'user-agent': 'cudic-prerender' } },
    );
    clearTimeout(t);
    if (!r.ok) return [];
    const data = await r.json();
    if (!Array.isArray(data)) return [];
    return data.map((c) => {
      const lines = String(c.commit.message).split('\n');
      const d = new Date(c.commit.author.date);
      return {
        sha: String(c.sha).substring(0, 7),
        title: lines[0],
        desc: lines.slice(1).join(' ').trim().substring(0, 140),
        date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      };
    });
  } catch {
    return [];
  }
}

const list = await commits();
const { render } = await import('./dist-server/entry-server.js');
const html = render(list);

let tpl = readFileSync(distHtml, 'utf8');
tpl = tpl.replace(
  '<!--ssr-outlet-->',
  html +
    `<script id="landing-commits" type="application/json">${JSON.stringify(list).replace(/</g, '\\u003c')}</script>` +
    `<script>window.__COMMITS__=JSON.parse(document.getElementById('landing-commits').textContent)</script>`,
);
writeFileSync(outHtml, tpl);
console.log(`prerendered public/index.html with ${list.length} baked commits`);
