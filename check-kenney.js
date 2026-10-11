// Asserts the Kenney pins in studio/src/kenney.ts still describe upstream.
const BRANCH = 'main';
const TREE = 'cb1ec688eec20806b656cb12e6d47b4592ff9718';
(async () => {
  const t = await (await fetch(`https://raw.githubusercontent.com/shorepine/kenney/${BRANCH}/index.tsv`)).text();
  const rows = t.split('\n').slice(1).filter(Boolean);
  const bad = rows.filter(r => r.split('\t').length !== 4);
  const packs = {};
  for (const r of rows) {
    const p = r.split('\t')[0].split('/')[0];
    packs[p] = (packs[p] || 0) + 1;
  }
  console.log('tsv rows', rows.length, 'bad', bad.length, packs);
  const j = await (await fetch(`https://api.github.com/repos/shorepine/kenney/git/trees/${TREE}?recursive=1`)).json();
  const glb = j.tree.filter(e => e.type === 'blob' && e.path.endsWith('.glb'));
  console.log('tree entries', j.tree.length, 'glb', glb.length, 'truncated', j.truncated);
  if (rows.length !== 48192 || bad.length || glb.length !== 4812) {
    console.error('MISMATCH');
    process.exit(1);
  }
  console.log('ok');
})().catch(e => { console.error(e.message); process.exit(1); });
