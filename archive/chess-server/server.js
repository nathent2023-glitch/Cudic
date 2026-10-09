/* Cudic chess service — Stockfish behind a small HTTP API.
 *
 * The browser game posts a FEN and a rating; it gets back one move. It never
 * speaks UCI, and nothing here forwards a client string into the engine, so
 * the service is not a general-purpose compute proxy.
 *
 * Local:  PORT=3001 node chess-server/server.js
 * Render: free web service, rootDir chess-server
 */
'use strict';
const http = require('http');
const { EnginePool, MOVE_RE } = require('./engine');
const { ELO_MIN, ELO_MAX, clampElo, bandName, missTolerance, chooseMove, centipawns } = require('./elo');

const PORT = Number(process.env.PORT || 3001);
const POOL_SIZE = Math.max(1, Number(process.env.ENGINE_POOL || 1));
const MOVETIME = Math.max(50, Math.min(3000, Number(process.env.ENGINE_MOVETIME || 400)));
const MULTI_PV_MAX = Math.max(2, Math.min(16, Number(process.env.ENGINE_MULTIPV || 8)));
const RATE_WINDOW = 60 * 1000;
/* read per request so it can be tightened or tested without a restart */
const rateMax = () => Number(process.env.RATE_MAX || 120);
const QUEUE_MAX = Number(process.env.QUEUE_MAX || 24);
const BODY_MAX = 8 * 1024;

/** Stockfish rejects an impossible position with a CRITICAL ERROR and then
 * sits silent, which costs a timeout. Catch the common nonsense first: the
 * board has to be 8x8 and hold no more than 16 pieces a side. */
function plausibleFen(fen) {
  const board = fen.split(' ')[0];
  const rows = board.split('/');
  if (rows.length !== 8) return false;
  let white = 0, black = 0;
  for (const r of rows) {
    let cells = 0;
    for (const ch of r) {
      if (/[a-zA-Z]/.test(ch)) {
        cells++;
        if (ch === ch.toUpperCase()) white++; else black++;
      } else {
        cells += Number(ch);
      }
    }
    if (cells !== 8) return false;
  }
  return white <= 16 && black <= 16;
}

/* A strong player only ever considers the best one or two moves. A beginner
 * looks at a much wider set — including moves that hang something. So the
 * candidate list widens as the rating drops, and only then do we sample. */
function multiPvFor(elo) {
  return Math.max(2, Math.min(MULTI_PV_MAX, 2 + Math.round((ELO_MAX - elo) / 600)));
}

/** A FEN is 6 space separated fields of digits, letters and a few marks */
const FEN_RE = /^([1-8pnbrqkPNBRQK+\/]+)\s([wb])\s(-|K?Q?k?q?)\s(-|[a-h][36])\s(\d+)\s(\d+)$/;

const pool = new EnginePool({ size: POOL_SIZE, path: process.env.STOCKFISH_PATH });
const buckets = new Map();

function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now > b.reset) {
    buckets.set(key, { n: 1, reset: now + windowMs });
    return true;
  }
  if (b.n >= max) return false;
  b.n++;
  return true;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (now > b.reset) buckets.delete(k);
}, 60000).unref();

function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket.remoteAddress || 'unknown';
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function json(res, code, body) {
  cors(res);
  const payload = JSON.stringify(body);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store'
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > BODY_MAX) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch (e) { reject(new Error('invalid json')); }
    });
    req.on('error', reject);
  });
}

async function handleMove(req, res) {
  const ip = clientIp(req);
  if (!rateLimit('move:' + ip, rateMax(), RATE_WINDOW)) {
    return json(res, 429, { error: 'Slow down a moment.' });
  }
  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    return json(res, 400, { error: e.message });
  }
  const fen = typeof body.fen === 'string' ? body.fen.trim() : '';
  if (!fen || fen.length > 120 || !FEN_RE.test(fen)) {
    return json(res, 400, { error: 'fen is required and must be a valid position' });
  }
  if (!plausibleFen(fen)) {
    return json(res, 400, { error: 'that is not a position on a board' });
  }
  const elo = clampElo(body.elo == null ? 1200 : body.elo);
  if (body.elo != null && !Number.isFinite(Number(body.elo))) {
    return json(res, 400, { error: 'elo must be a number' });
  }
  if (pool.stats().waiting >= QUEUE_MAX) {
    return json(res, 503, { error: 'Engine is busy, try again in a second.' });
  }
  const movetimeMs = body.movetimeMs == null
    ? MOVETIME
    : Math.max(80, Math.min(1500, Number(body.movetimeMs) || MOVETIME));

  try {
    const multiPv = multiPvFor(elo);
    const result = await pool.run(async engine => {
      const search = await engine.search(fen, { multiPv, movetimeMs });
      const pick = chooseMove(search.lines, elo);
      const played = centipawns(pick);
      const best = Math.max(...search.lines.map(centipawns));
      return {
        move: pick.pv[0],
        lines: search.lines.length,
        depth: pick.depth,
        ms: search.ms,
        playedCp: played >= 10000 || played <= -10000 ? null : played,
        lossCp: Math.max(0, best - played)
      };
    });
    if (!MOVE_RE.test(result.move || '')) {
      return json(res, 502, { error: 'engine returned an unusable move' });
    }
    return json(res, 200, {
      move: result.move,
      elo,
      band: bandName(elo),
      missTolerance: Math.round(missTolerance(elo)),
      depth: result.depth,
      ms: result.ms,
      lines: result.lines,
      multiPv,
      playedCp: result.playedCp,
      lossCp: result.lossCp
    });
  } catch (e) {
    console.error('move failed:', e && e.message);
    return json(res, 503, { error: 'Engine is warming up. Try that move again.' });
  }
}

const server = http.createServer(async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const path = (req.url || '/').split('?')[0];

  if (req.method === 'GET' && (path === '/' || path === '/health')) {
    const s = pool.stats();
    return json(res, 200, {
      ok: true,
      engine: s.ready ? 'ready' : 'cold',
      ...s
    });
  }

  /* Called when the chess game opens. On a free host the instance may have
     spun down; doing this while the player reads the board hides the wake-up. */
  if (req.method === 'GET' && path === '/warm') {
    const t0 = Date.now();
    const ready = await pool.warm();
    return json(res, 200, { ok: ready, ms: Date.now() - t0, ...pool.stats() });
  }

  if (req.method === 'GET' && path === '/ladder') {
    return json(res, 200, { min: ELO_MIN, max: ELO_MAX });
  }

  if (req.method === 'POST' && path === '/move') return handleMove(req, res);

  return json(res, 404, { error: 'not found' });
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`chess service on :${PORT} — engine ${pool.path || '(auto)'}, pool ${POOL_SIZE}`);
    /* start loading NNUE straight away so the first move is not the slow one */
    pool.warm().then(ok => console.log(ok ? 'engine ready' : 'engine missing — /move will fail'));
  });
  process.on('SIGTERM', () => { pool.stopAll(); server.close(() => process.exit(0)); });
}

module.exports = { server, pool, FEN_RE, plausibleFen };
