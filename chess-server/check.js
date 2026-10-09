/* Chess service check.  node chess-server/check.js
 *
 * Boots the real HTTP service, points it at a real Stockfish binary, and plays
 * moves through it. Skips (exit 0) if no engine is installed, so a machine
 * without Stockfish is not a failure — it just cannot run this one.
 *
 *   STOCKFISH_PATH=/usr/bin/stockfish node chess-server/check.js
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

let failed = 0;
function check(name, ok, extra) {
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
}

/* ── find an engine ─────────────────────────────────────────────── */
const candidates = [
  process.env.STOCKFISH_PATH,
  '/usr/bin/stockfish',
  path.join(__dirname, 'stockfish', 'stockfish'),
  path.join(__dirname, '..', 'node_modules', '.bin', 'stockfish')
].filter(Boolean);

function works(p) {
  return new Promise(resolve => {
    let proc;
    try { proc = spawn(p, [], { stdio: ['pipe', 'pipe', 'ignore'] }); }
    catch (e) { return resolve(false); }
    let out = '';
    const t = setTimeout(() => { proc.kill(); resolve(false); }, 6000);
    proc.stdout.on('data', d => {
      out += d;
      if (out.includes('uciok')) { clearTimeout(t); proc.kill(); resolve(true); }
    });
    proc.on('error', () => { clearTimeout(t); resolve(false); });
    proc.on('exit', () => { clearTimeout(t); resolve(false); });
    try { proc.stdin.write('uci\n'); } catch (e) { clearTimeout(t); resolve(false); }
  });
}

(async () => {
  let enginePath = null;
  for (const c of candidates) {
    if (fs.existsSync(c) === false && c !== 'stockfish') continue;
    if (await works(c)) { enginePath = c; break; }
  }
  if (!enginePath) {
    console.log('skip  no Stockfish binary found — set STOCKFISH_PATH to run this check');
    process.exit(0);
  }
  console.log(`engine: ${enginePath}`);

  process.env.STOCKFISH_PATH = enginePath;
  process.env.PORT = '0';
  process.env.ENGINE_MOVETIME = '250';
  const { server, pool } = require('./server');
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  const call = (p, opts) => new Promise((resolve, reject) => {
    const req = http.request(base + p, opts, res => {
      let body = '';
      res.on('data', d => { body += d; });
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(body) }); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    if (opts && opts.body) req.write(opts.body);
    req.end();
  });
  const post = (p, obj) => call(p, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj)
  });

  /* ── endpoints ─────────────────────────────────────────────────── */
  const warm = await call('/warm');
  check('/warm returns ready', warm.status === 200 && warm.body.ok === true);

  const health = await call('/health');
  check('/health reports ok', health.status === 200 && health.body.ok === true);
  check('/health reports the engine ready', health.body.engine === 'ready', health.body.engine);
  check('the engine path is reported', !!health.body.path, String(health.body.path));

  /* ── validation: the service must not be an open compute proxy ── */
  const badFen = await post('/move', { fen: 'not a position', elo: 1200 });
  check('a bad fen is rejected', badFen.status === 400, String(badFen.status));

  const injection = await post('/move', { fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1; quit', elo: 1200 });
  check('a fen with injected commands is rejected', injection.status === 400, String(injection.status));

  const noFen = await post('/move', { elo: 1200 });
  check('a missing fen is rejected', noFen.status === 400, String(noFen.status));

  /* Stockfish answers an impossible position with a CRITICAL ERROR and then
     goes silent, so the request dies on a timeout instead of answering. */
  const tooMany = await post('/move', {
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNRR w KQkq - 0 1', elo: 1200
  });
  check('a position with too many pieces is rejected', tooMany.status === 400,
    String(tooMany.status));

  const shortRank = await post('/move', {
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBN w KQkq - 0 1', elo: 1200
  });
  check('a rank that is not 8 squares is rejected', shortRank.status === 400,
    String(shortRank.status));

  check('a real position still gets through',
    (await post('/move', {
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', elo: 1200
    })).status === 200);

  const extra = await post('/move', {
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', elo: 1200,
    command: 'go infinite'
  });
  check('unknown fields are ignored, not executed', extra.status === 200 && !!extra.body.move);

  /* ── real moves ───────────────────────────────────────────────── */
  const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const first = await post('/move', { fen: START, elo: 1200 });
  check('opening move is a legal chess move', first.status === 200 && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(first.body.move || ''), first.body.move);
  check('the band name comes back', typeof first.body.band === 'string' && first.body.band.length > 0, first.body.band);

  /* every rating the page offers has to have a name, or the picker shows a blank */
  const named = await post('/move', { fen: START, elo: 3000 });
  check('the top of the ladder is named', named.body.band === 'Grandmaster', named.body.band);
  const lowest = await post('/move', { fen: START, elo: 100 });
  check('the bottom of the ladder is named', lowest.body.band === 'Beginner', lowest.body.band);
  check('multipv lines came back', first.body.lines >= 2, 'lines=' + first.body.lines);

  /* the engine must be able to find a forced mate from a mate-in-one */
  const MATE_FEN = '6k1/5ppp/8/8/8/8/8/R3K2R w KQ - 0 1';
  let topTakesMate = 0;
  for (let i = 0; i < 6; i++) {
    const r = await post('/move', { fen: MATE_FEN, elo: 3000 });
    if (r.body.move === 'a1a8') topTakesMate++;
  }
  check('a 3000 bot never misses mate in one', topTakesMate === 6, `${topTakesMate}/6 took Ra8#`);

  /* ── rating behaviour ─────────────────────────────────────────── */
  const probe = 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 4 4';
  const topElo = await post('/move', { fen: probe, elo: 3000 });
  check('a 3000 bot takes the winning capture', topElo.body.move === 'f3f7', topElo.body.move);

  /* the weakest band should disagree with the strongest at least sometimes */
  const quiet = 'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3';
  const weakMoves = new Set();
  for (let i = 0; i < 16; i++) {
    const r = await post('/move', { fen: quiet, elo: 100 });
    if (r.body.move) weakMoves.add(r.body.move);
  }
  check('a 100 elo bot does not just replay the same move every time', weakMoves.size > 1,
    `${weakMoves.size} distinct: ${[...weakMoves].join(' ')}`);

  /* the candidate set widens as the rating drops */
  const topPv = await post('/move', { fen: quiet, elo: 3000 });
  const lowPv = await post('/move', { fen: quiet, elo: 100 });
  check('a 3000 bot only considers the top couple of moves', topPv.body.multiPv === 2,
    String(topPv.body.multiPv));
  check('a 100 elo bot sees a much wider set', lowPv.body.multiPv >= 6, String(lowPv.body.multiPv));

  /* Real weakness shows up as missed tactics, not as vague positional drift.
     Ask each band the same two positions where something is on the board, and
     see whether it notices. */
  const TACTIC_FENS = [
    '6k1/5ppp/8/8/8/8/8/R3K2R w KQ - 0 1',                          /* Ra8 is mate */
    'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 4 4' /* Qxf7 is mate */
  ];
  const probeLadder = async (elo, runs) => {
    let worst = 0;
    for (const fen of TACTIC_FENS) {
      for (let i = 0; i < runs; i++) {
        const r = await post('/move', { fen, elo });
        if (r.body.lossCp == null) { worst = 9999; continue; }
        worst = Math.max(worst, r.body.lossCp);
      }
    }
    return worst;
  };
  const topWorst = await probeLadder(3000, 6);
  const midWorst = await probeLadder(1200, 6);
  const lowWorst = await probeLadder(100, 6);
  check('a 3000 bot takes every tactic on offer', topWorst <= 10, `worst ${topWorst}cp`);
  check('the ladder is ordered worst-case too',
    topWorst <= midWorst && midWorst <= lowWorst,
    `3000: ${topWorst} / 1200: ${midWorst} / 100: ${lowWorst}`);

  /* How often a band misses is a property of elo.js, not of HTTP, and sampling
   * it over the network is a coin flip on a 16-move sample. Measure it directly
   * with a seeded generator so the numbers below mean the same thing twice. */
  const { chooseMove, missTolerance } = require('./elo');
  /* a position where line 1 is mate and the rest throw the game away */
  const trap = [
    { mate: 1, pv: ['a1a8'], depth: 20 },
    { cp: -900, pv: ['a1a7'], depth: 20 },
    { cp: -940, pv: ['a1h8'], depth: 20 }
  ];
  const seedRng = (seed) => {
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  };
  const missRate = (elo, trials) => {
    const rng = seedRng(1234 + elo);
    let missed = 0;
    for (let i = 0; i < trials; i++) {
      const picked = chooseMove(trap, elo, rng);
      if (picked.pv[0] !== 'a1a8') missed++;
    }
    return missed / trials;
  };
  check('a 3000 bot takes the mate every time', missRate(3000, 200) === 0);
  check('a 100 elo bot walks past the mate often', missRate(100, 200) > 0.5,
    `${Math.round(missRate(100, 200) * 100)}% missed`);
  check('miss rate falls as the rating rises',
    missRate(100, 200) > missRate(1200, 200) && missRate(1200, 200) > missRate(3000, 200),
    `100: ${Math.round(missRate(100, 200) * 100)}% / 1200: ${Math.round(missRate(1200, 200) * 100)}%`);
  check('tolerance grows as the rating drops',
    missTolerance(100) > missTolerance(1200) && missTolerance(1200) > missTolerance(3000),
    `${Math.round(missTolerance(100))} / ${Math.round(missTolerance(1200))} / ${Math.round(missTolerance(3000))}cp`);

  /* ── rate limiting ────────────────────────────────────────────── */
  process.env.RATE_MAX = '3';
  let limited = false;
  for (let i = 0; i < 8 && !limited; i++) {
    const r = await post('/move', { fen: START, elo: 800 });
    if (r.status === 429) limited = true;
  }
  process.env.RATE_MAX = '120';
  check('the rate limit trips', limited);

  console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
  pool.stopAll();
  server.close();
  process.exit(failed ? 1 : 0);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
