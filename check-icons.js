// Every icon the picker can offer must actually be fetchable.
//
// insertIcon built its URL from the pack's *label* while the folders on disk
// are named by *id* ("Game icons" vs "game-icons"), so all 674 icons 404'd.
// Nothing caught it because the picker still listed them. This walks the
// manifest and fails loudly on the first mismatch.
//
//   node check-icons.js          (from studio/)
//
// ponytail: checks the manifest against disk only. It cannot catch a URL that
// the server refuses to serve. Upgrade path: point the same table at the
// running dev server and assert on status codes.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, 'public', 'assets', 'kenney');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));

let checked = 0;
const problems = [];

for (const pack of manifest.packs) {
  const dir = path.join(ROOT, pack.id);
  if (!fs.existsSync(dir)) {
    problems.push(`pack "${pack.id}" (label "${pack.label}") has no folder`);
    continue;
  }
  // The exact thing that broke: label and id are not interchangeable.
  if (pack.label !== pack.id) {
    // Not an error, just note it so the rule stays visible where it matters.
  }
  for (const set of pack.sets) {
    for (const icon of set.icons) {
      checked++;
      const rel = pack.id + (set.id === '' ? '' : '/' + set.id) + '/' + icon.file;
      if (!fs.existsSync(path.join(ROOT, rel))) problems.push(`missing ${rel}`);
    }
  }
}

if (problems.length) {
  console.error(`${problems.length} problem(s):`);
  for (const p of problems.slice(0, 20)) console.error('  ' + p);
  process.exit(1);
}

console.log(`all ${checked} icons resolve under their pack id (${manifest.packs.length} packs)`);
