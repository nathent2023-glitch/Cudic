// Asserts every pinned CDN URL the Studio viewers depend on still resolves.
// Run after touching the viewer constants in studio/src/glox.ts.
const URLS = [
  'https://cdn.jsdelivr.net/npm/three@0.163.0/build/three.module.js',
  'https://cdn.jsdelivr.net/npm/three@0.163.0/examples/jsm/controls/OrbitControls.js',
  'https://cdn.jsdelivr.net/npm/three@0.163.0/examples/jsm/loaders/GLTFLoader.js',
  'https://cdn.jsdelivr.net/npm/@aiden0z/pptx-renderer@1.3.0/dist/aiden0z-pptx-renderer.browser.es.js',
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/xlsx.mjs'
];
(async () => {
  let bad = 0;
  for (const u of URLS) {
    const r = await fetch(u, { method: 'HEAD' });
    const kb = (Number(r.headers.get('content-length')) / 1024).toFixed(0);
    console.log(r.status, kb.padStart(5) + 'KB', u.replace('https://cdn.jsdelivr.net/npm/', ''));
    if (!r.ok) bad++;
  }
  if (bad) {
    console.error(bad + ' URL(s) failed');
    process.exit(1);
  }
  console.log('ok');
})().catch(e => {
  console.error(e.message);
  process.exit(1);
});
