/* Engine check for the Cudic seed games. Run with:  node seed-games/check.js
 *
 * Chess: perft from the start position (20 / 400 / 8902) plus the rules that
 * perft(3) does not reach — castling, en passant, promotion, checkmate.
 * Tic tac toe: the minimax bot must draw from empty and take a free win.
 *
 * No dependencies. The page scripts are stubbed with just enough DOM to run.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let failed = 0;
function check(name, ok, extra) {
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
}

function lastInlineScript(file) {
  const html = fs.readFileSync(path.join(__dirname, file), 'utf8');
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  return blocks[blocks.length - 1][1];
}

function runScript(src, probeBody, name, opts) {
  /* a chainable stub, one per element id, so the page can walk
     el.board -> el.squares -> children and we can inspect the markup later */
  const makeEl = () => {
    const target = { className: '', textContent: '', innerHTML: '', src: '',
      appended: [], addEventListener() {}, getAttribute: () => null, setAttribute() {},
      removeChild() {}, children: [],
      style: { setProperty() {} },
      firstChild: null, parentNode: null,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0 }),
      classList: { add() {}, remove() {}, contains: () => false } };
    target.appendChild = child => { target.appended.push(child); return child; };
    return new Proxy(target,
      { get: (t, k) => (k in t ? t[k] : (typeof k === 'string' ? t : undefined)),
        /* assigning innerHTML really does replace the children */
        set: (t, k, v) => { t[k] = v; if (k === 'innerHTML') t.appended.length = 0; return true; } });
  };
  const nodes = new Map();
  const pick = id => {
    if (!nodes.has(id)) nodes.set(id, makeEl());
    return nodes.get(id);
  };
  const doc = { getElementById: pick, querySelector: () => makeEl(),
    querySelectorAll: () => [], addEventListener() {},
    createElement: () => makeEl() };
  const store = {};
  const ctx = vm.createContext({
    document: doc, window: { document: doc }, console,
    location: { protocol: 'https:' },
    /* synchronous timers let the page drive its own bot turn */
    setTimeout: (opts && opts.syncTimers) ? fn => { fn(); return 0; } : setTimeout,
    clearTimeout,
    /* The chess page asks a service for its moves. Tests install a reply
       function on opts.service; nothing here touches the network. */
    fetch: (url, o) => {
      const svc = opts && opts.service;
      if (!svc) return Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({}) });
      if (/\/warm$/.test(String(url))) {
        svc.warmed++;
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) });
      }
      if (svc.down) {
        return Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({}) });
      }
      const body = JSON.parse((o && o.body) || '{}');
      svc.seen = { url, body };
      if (typeof svc.reply !== 'function') {
        return Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({}) });
      }
      const payload = svc.reply(url, body);
      /* a cold instance is the one case the page is allowed to see fail */
      const cold = payload && payload.cold;
      return Promise.resolve({
        ok: !cold, status: cold ? 503 : 200,
        json: () => Promise.resolve(
          typeof payload === 'string' ? { move: payload } : payload)
      });
    },
    AbortController: function () { this.signal = null; this.abort = () => {}; },
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = v; },
      removeItem: k => { delete store[k]; }
    }
  });
  const injected = src.replace(/\}\)\(\);\s*$/, `window.__p = {\n${probeBody}\n};\n})();`);
  vm.runInContext(injected, ctx, { filename: name });
  ctx.window.__p.__nodes = nodes;
  return ctx.window.__p;
}

/* every icon the page asks for has to exist on disk, or the squares grow
 * uneven and the alt text leaks through */
(function () {
  const publicDir = path.join(__dirname, '..', 'public');
  const missing = [];
  for (const file of ['chess/index.html', 'tictactoe/index.html']) {
    const html = fs.readFileSync(path.join(__dirname, file), 'utf8');
    const rel = new Set();
    for (const m of html.matchAll(/data-ico="([^"]+)"/g)) rel.add(m[1]);
    /* plus everything the scripts build at runtime */
    if (file.startsWith('chess')) {
      const LETTER = ['', 'pawn', 'knight', 'bishop', 'rook', 'queen', 'king'];
      for (const side of ['white', 'black']) {
        for (let k = 1; k <= 6; k++) rel.add(`chess/${side}/chess_${LETTER[k]}.svg`);
      }
    } else {
      rel.add('game-icons/black/cross.png');
      rel.add('board-game-icons/token.png');
    }
    for (const r of ['trophy', 'gamepad', 'minus', 'medal1', 'exitRight']) {
      rel.add(`game-icons/black/${r}.png`);
    }
    for (const r of rel) {
      if (!fs.existsSync(path.join(publicDir, 'assets', 'kenney', r))) missing.push(`${file}: ${r}`);
    }
  }
  check('every game icon exists in public/assets/kenney', missing.length === 0, missing.join(' '));
})();

/* ── chess ──────────────────────────────────────────────────────── */
/* stands in for the chess service while the page's own fetch runs */
const service = { reply: null, seen: null, warmed: 0, down: false };

const chess = runScript(lastInlineScript('chess/index.html'), `
  genMoves: genMoves,
  getTurn: function () { return turn; },
  doMove: doMove,
  afterMove: afterMove,
  takeSnap: takeSnap,
  restore: restoreSnap,
  reset: reset,
  isOver: function () { return over; },
  getStats: function () { return stats; },
  setLevel: function (i) { eloIdx = i; },
  setBoard: function (b) { board = b; },
  toFen: toFen,
  /* the board -> FEN half of the service call is worth checking directly:
     if this drifts, the engine is being asked about the wrong position */
  fenFor: function () { return toFen(); },
  getLastBotMove: function () { return lastMove; },
  getStatus: function () { return el.status.textContent; },
  isThinking: function () { return thinking; },
  warmUp: warmUp
`, 'chess-inline.js', { syncTimers: true, service });

function perft(depth) {
  const ms = chess.genMoves(chess.getTurn());
  if (depth === 1) return ms.length;
  let n = 0;
  for (const m of ms) {
    const s = chess.takeSnap();
    chess.doMove(m);
    n += perft(depth - 1);
    chess.restore(s);
  }
  return n;
}

chess.reset();
[[1, 20], [2, 400], [3, 8902]].forEach(([d, want]) => {
  const got = perft(d);
  check(`chess perft(${d})`, got === want, `${got}`);
});

const sq = (r, c) => r * 8 + c;
/* a move as the service and the page both spell it: from-square, to-square */
function nameOf(m) {
  return 'abcdefgh'[m.from % 8] + (8 - ((m.from / 8) | 0)) +
         'abcdefgh'[m.to % 8] + (8 - ((m.to / 8) | 0));
}
/* async checks register here so the summary waits for them */
const pending = [];
function find(from, to) {
  const m = chess.genMoves(chess.getTurn()).find(x => x.from === from && x.to === to);
  if (!m) throw new Error(`expected a legal move ${from}->${to}`);
  return m;
}

/* castling: available once the path is clear, gone once king or rook moves */
chess.reset();
(function () {
  const blank = chess.takeSnap().b.slice();
  blank[sq(7, 5)] = 0; blank[sq(7, 6)] = 0;   /* empty f1 and g1 */
  chess.setBoard(blank);
  check('chess castling generated when the path is clear',
    chess.genMoves(1).some(m => m.castle === 'K' && m.to === sq(7, 6)));
})();
chess.reset();
(function () {
  const b = chess.takeSnap().b.slice();
  b[sq(7, 3)] = 0; b[sq(7, 5)] = 0;           /* free d1/f1 so the king has a move */
  chess.setBoard(b);
  chess.doMove(chess.genMoves(1).find(m => m.from === 60));
  check('chess castling rights cleared after the king moves',
    !chess.genMoves(-1).some(m => m.castle === 'K' || m.castle === 'Q'));
})();
chess.reset();
(function () {
  const b = chess.takeSnap().b.slice();
  b[sq(7, 6)] = 0;                            /* free g1 so the rook has a move */
  chess.setBoard(b);
  chess.doMove(chess.genMoves(1).find(m => m.from === 63));
  check('chess castling rights cleared after the rook moves',
    !chess.genMoves(-1).some(m => m.castle === 'K'));
})();

/* en passant: 1.e4 a6 2.e5 d5 3.exd6 e.p. */
chess.reset();
(function () {
  chess.doMove(find(sq(6, 4), sq(4, 4)));       /* e2e4 */
  chess.doMove(find(sq(1, 0), sq(2, 0)));       /* a7a6 */
  chess.doMove(find(sq(4, 4), sq(3, 4)));       /* e4e5 */
  chess.doMove(find(sq(1, 3), sq(3, 3)));       /* d7d5 */
  const ep = chess.genMoves(1).find(m => m.flag === 'ep');
  check('chess en passant generated', !!ep,
    ep ? `${'abcdefgh'[ep.to % 8]}${8 - Math.floor(ep.to / 8)}` : '');
  if (ep) {
    chess.doMove(ep);
    const b = chess.takeSnap().b;
    check('chess en passant removes the captured pawn', b[sq(3, 3)] === 0);
  }
})();

/* promotion auto-queens (under-promotion is deliberately not offered) */
chess.reset();
(function () {
  const b = chess.takeSnap().b.slice();
  b[0] = 0; b[8] = 1;                           /* a8 empty, white pawn on a7 */
  chess.setBoard(b);
  const promo = chess.genMoves(1).find(m => m.from === 8 && m.to === 0 && m.flag === 'promo');
  check('chess promotion generated', !!promo);
  if (promo) {
    chess.doMove(promo);
    check('chess promotion becomes a queen', chess.takeSnap().b[0] === 5);
  }
})();

/* fool's mate must read as mate */
chess.reset();
(function () {
  chess.doMove(find(sq(6, 5), sq(5, 5)));       /* f2f3 */
  chess.doMove(find(sq(1, 4), sq(3, 4)));       /* e7e5 */
  chess.doMove(find(sq(6, 6), sq(4, 6)));       /* g2g4 */
  chess.doMove(find(sq(0, 3), sq(4, 7)));       /* Qd8h4# */
  check('chess checkmate leaves no legal move', chess.genMoves(1).length === 0);
})();

/* the board is exported to the service as FEN, so it has to be right — a
 * drifted FEN means the engine is being asked about a position nobody is in */
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
chess.reset();
check('chess exports the start position', chess.toFen() === START_FEN, chess.toFen());

chess.reset();
chess.doMove(find(sq(6, 4), sq(4, 4)));          /* e2e4 */
check('chess exports the position after a move',
  chess.toFen() === 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
  chess.toFen());

chess.reset();
chess.doMove(find(sq(6, 4), sq(4, 4)));          /* e2e4 */
chess.doMove(find(sq(1, 3), sq(3, 3)));          /* ...d7d5 — now e4 can be taken */
check('chess exports the en passant square',
  chess.toFen().split(' ')[3] === 'd6', chess.toFen());
chess.doMove(find(sq(4, 4), sq(3, 3)));          /* exd6 en passant, which clears it */
check('chess clears the en passant square once taken',
  chess.toFen().split(' ')[3] === '-', chess.toFen());

/* a new game must not inherit leftovers */
chess.reset();
(function () {
  chess.doMove(chess.genMoves(1).find(m => m.from === 48 && m.to === 40));  /* a2a4 */
  chess.reset();
  const b = chess.takeSnap().b;
  check('chess reset clears the board', b[sq(5, 0)] === 0 && b[sq(6, 0)] === 1);
})();

/* The service call itself: the page must send the FEN it just built and play
 * back the UCI it was given — and refuse a move that is not legal here. */
/* these two share one page and one service stub, so they have to run in
   sequence — not as two blocks racing on the same board */
pending.push((async () => {
  chess.reset();
  service.reply = (url, body) => {
    check('chess asks the move service for a move', /\/move$/.test(String(url)), String(url));
    check('chess posts the position it just built',
      body.fen === 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
      String(body.fen));
    check('chess sends a rating the service accepts',
      typeof body.elo === 'number' && body.elo >= 100 && body.elo <= 3000, String(body.elo));
    return 'e7e5';
  };
  chess.doMove(find(sq(6, 4), sq(4, 4)));        /* e2e4 */
  chess.afterMove();                             /* now black replies */
  await new Promise(r => setTimeout(r, 30));
  const played = chess.getLastBotMove();
  check('chess plays the move the service returned',
    !!played && nameOf(played) === 'e7e5',
    played ? `${played.from}->${played.to} = ${nameOf(played)}` : 'no move');
  check('chess leaves it your turn', chess.getTurn() === 1,
    `turn ${chess.getTurn()}, status "${chess.getStatus()}"`);

  /* an illegal move from the service must not be applied to the board */
  chess.reset();
  service.reply = () => 'a1a8';
  chess.doMove(find(sq(6, 4), sq(4, 4)));
  chess.afterMove();
  await new Promise(r => setTimeout(r, 30));
  check('chess refuses an illegal move from the service', chess.getTurn() === -1,
    String(chess.getTurn()));
  check('chess tells the player the engine is unavailable',
    /unavailable/i.test(chess.getStatus()), chess.getStatus());

  /* the page warms the engine on open, so a cold instance is already spinning
     up by the time the player moves */
  service.warmed = 0;
  chess.reset();
  chess.warmUp();
  check('chess warms the engine when the page opens', service.warmed === 1,
    String(service.warmed));

  /* a cold instance answers 503 while Stockfish starts; one retry covers it */
  chess.reset();
  let tries = 0;
  service.reply = () => {
    tries++;
    if (tries === 1) return { cold: true };
    return { move: 'e7e5' };
  };
  chess.doMove(find(sq(6, 4), sq(4, 4)));
  chess.afterMove();
  await new Promise(r => setTimeout(r, 30));
  check('chess retries once when the engine is still cold',
    tries === 2 && chess.getTurn() === 1, `tries ${tries}, turn ${chess.getTurn()}`);

  /* a real outage is reported rather than papered over with a local move */
  chess.reset();
  service.down = true;
  service.reply = () => ({ move: 'e7e5' });
  chess.doMove(find(sq(6, 4), sq(4, 4)));
  chess.afterMove();
  await new Promise(r => setTimeout(r, 30));
  check('chess reports a real outage', /unavailable/i.test(chess.getStatus()),
    chess.getStatus());
  service.down = false;

  /* play whole games to a real result, driving both sides through the page's
     own move application. Bot strength is chess-server/check.js's job; what
     matters here is that a full game always terminates. The service stands in
     for the black side with a deterministic reply. */
  service.reply = () => {
    const ms = chess.genMoves(chess.getTurn());
    return ms.length ? nameOf(ms[0]) : 'a1a1';
  };
  let finished = 0, plies = 0;
  for (let g = 0; g < 12; g++) {
    chess.reset();
    let n = 0;
    while (n < 400 && !chess.isOver()) {
      const moves = chess.genMoves(chess.getTurn());
      if (!moves.length) break;
      if (chess.getTurn() === 1) {
        chess.doMove(moves[(n * 7 + g * 3) % moves.length]);   /* white: the "user" */
      }
      chess.afterMove();
      await new Promise(r => setTimeout(r, 0));
      n++;
    }
    plies += n;
    if (chess.isOver()) finished++;
  }
  check('chess full games reach a result', finished === 12, `${finished}/12, ${plies} plies`);
})());


/* the render layer: 64 tiles and one persistent element per piece, because
 * rebuilding the board is what killed the animation. Chained after the service
 * tests, since those reset the board too. */
pending.push(async () => {
  chess.reset();
  const nodes = chess.__nodes;
  const tiles = nodes.get('squares').innerHTML;
  const tileCount = (tiles.match(/data-sq=/g) || []).length;
  const pieceCount = nodes.get('pieces').appended.length;
  check('chess renders 64 tiles', tileCount === 64, String(tileCount));
  check('chess renders one element per piece', pieceCount === 32, String(pieceCount));
});

/* ── tic tac toe ────────────────────────────────────────────────── */
const ttt = runScript(lastInlineScript('tictactoe/index.html'), `
  minimax: minimax,
  winnerOf: winnerOf,
  full: full,
  reset: reset,
  isOver: function () { return over; },
  getBoard: function () { return board.slice(); },
  getStats: function () { return stats; },
  playAt: function (i) { board[i] = 1; paint(); settle(); }
`, 'ttt-inline.js', { syncTimers: true });

const fresh = () => new Array(9).fill(0);

check('ttt minimax draws from an empty board', ttt.minimax(fresh(), -1) === 0);
check('ttt minimax draws with white to move', ttt.minimax(fresh(), 1) === 0);

(function () {
  const b = fresh();
  b[0] = 1; b[3] = -1; b[4] = -1;             /* O holds the middle row, one square free */
  check('ttt minimax takes a free win', ttt.minimax(b, -1) === 1);
})();

(function () {
  /* play the bot against itself the way the game does, and check neither
     side ever drops a game */
  let losses = 0, draws = 0;
  for (let g = 0; g < 200; g++) {
    const b = fresh();
    let turn = 1;
    for (;;) {
      const w = ttt.winnerOf(b);
      if (w) { if (w === turn) losses++; else draws++; break; }
      if (ttt.full(b)) { draws++; break; }
      let best = -1, bestScore = -2;
      for (let i = 0; i < 9; i++) {
        if (b[i]) continue;
        b[i] = turn;
        const s = -ttt.minimax(b, -turn);
        b[i] = 0;
        if (s > bestScore) { bestScore = s; best = i; }
      }
      b[best] = turn;
      turn = -turn;
    }
  }
  check('ttt perfect play never loses for either side', losses === 0, `${draws} draws`);
})();

(function () {
  const b = fresh();
  b[0] = 1; b[1] = 1;                        /* X threatens the top row: O has to answer */
  check('ttt minimax sees the forced loss', ttt.minimax(b, -1) === -1);
})();

(function () {
  const b = [1, -1, 1, 1, 1, -1, -1, 1, -1];  /* full board, nobody has three */
  check('ttt winnerOf on a drawn full board', ttt.winnerOf(b) === 0);
})();

(function () {
  const b = [1, -1, -1, 1, -1, -1, -1, 1, 0]; /* O already owns the anti-diagonal */
  check('ttt minimax sees an already-won board', ttt.minimax(b, -1) === 1);
})();

/* drive real games through the page's own settle/bot path */
(function () {
  let finished = 0, bad = 0;
  for (let g = 0; g < 40; g++) {
    ttt.reset();
    let n = 0;
    while (n < 5 && !ttt.isOver()) {
      const b = ttt.getBoard();
      const empties = [];
      for (let i = 0; i < 9; i++) if (!b[i]) empties.push(i);
      if (!empties.length) break;
      ttt.playAt(empties[(g + n) % empties.length]);
      n++;
    }
    if (ttt.isOver()) finished++;
    const b = ttt.getBoard();
    /* the bot must never have placed two stones in one square */
    if (b.filter(v => v === 1).length > 5 || b.filter(v => v === -1).length > 4) bad++;
  }
  check('ttt full games end and the bot never doubles up', finished === 40 && bad === 0);
})();

/* the service-call checks are async: they wait on the page's own fetch round
   trip, so the report waits for them */
Promise.all(pending).then(() => {
  console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
  process.exit(failed ? 1 : 0);
});
