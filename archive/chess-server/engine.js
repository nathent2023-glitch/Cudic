/* Stockfish over UCI.
 *
 * One process per pool slot, reused across requests (NNUE load is the
 * expensive part). Every command string is built here — the client never gets
 * to send UCI, only a FEN, so this is not an open compute proxy.
 */
'use strict';
const { spawn } = require('child_process');

const MOVE_RE = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

/** A single engine process, reused across requests. */
class Engine {
  constructor(path, args) {
    this.path = path;
    this.args = args || [];
    this.proc = null;
    this.busy = false;
    this.alive = false;
    this._buf = '';
  }

  /** spawn + UCI handshake. Returns false if the binary is missing or wedged. */
  async start() {
    let proc;
    try {
      proc = spawn(this.path, this.args, { stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (e) {
      return false;
    }
    this.proc = proc;
    this._buf = '';
    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', d => { this._buf += d; });
    proc.stderr.resume();
    proc.on('error', () => { this.alive = false; });
    proc.on('exit', () => { this.alive = false; });

    const write = line => {
      try { proc.stdin.write(line + '\n'); return true; } catch (e) { return false; }
    };
    if (!write('uci')) { this.stop(); return false; }
    this.alive = true;
    if (!await this._waitFor('uciok', 8000)) { this.stop(); return false; }
    if (!write('isready')) { this.stop(); return false; }
    if (!await this._waitFor('readyok', 8000)) { this.stop(); return false; }
    this._buf = '';
    return true;
  }

  _waitFor(needle, timeoutMs) {
    return new Promise(resolve => {
      const started = Date.now();
      const poll = setInterval(() => {
        if (this._buf.indexOf(needle) !== -1) { clearInterval(poll); resolve(true); return; }
        if (Date.now() - started > timeoutMs) { clearInterval(poll); resolve(false); }
      }, 20);
    });
  }

  /**
   * Ask for the top `multiPv` moves with their evaluations.
   * Resolves to { bestmove, lines: [{ cp | mate, pv[], depth }], ms }.
   */
  search(fen, { multiPv = 4, movetimeMs = 400 } = {}) {
    if (!this.alive) return Promise.reject(new Error('engine is not running'));
    this._buf = '';
    const seen = {};
    const timeoutMs = movetimeMs + 4000;
    const started = Date.now();

    return new Promise((resolve, reject) => {
      let bestmove = null;
      const collect = () => Object.keys(seen).map(Number).sort((a, b) => a - b).map(k => seen[k]);
      const finish = (err, val) => {
        clearInterval(poll);
        clearTimeout(hardStop);
        err ? reject(err) : resolve(val);
      };
      const hardStop = setTimeout(() => finish(new Error('engine timed out')), timeoutMs);

      const poll = setInterval(() => {
        const lines = this._buf.split('\n');
        this._buf = '';
        for (const raw of lines) {
          const line = raw.trim();
          if (!line) continue;
          if (line.startsWith('bestmove')) {
            bestmove = line.split(/\s+/)[1];
            const out = collect();
            if (!out.length) return finish(new Error('no principal variations'));
            const first = out[0].pv[0];
            return finish(null, {
              bestmove: MOVE_RE.test(bestmove || '') ? bestmove : first,
              lines: out,
              ms: Date.now() - started
            });
          }
          if (!line.startsWith('info ')) continue;
          const multi = /multipv (\d+)/.exec(line);
          const pv = /\bpv (.+)$/.exec(line);
          if (!multi || !pv) continue;
          const moves = pv[1].trim().split(/\s+/).filter(m => MOVE_RE.test(m));
          if (!moves.length) continue;
          const cp = /score cp (-?\d+)/.exec(line);
          const mate = /score mate (-?\d+)/.exec(line);
          const depth = /depth (\d+)/.exec(line);
          seen[+multi[1]] = {
            cp: cp ? +cp[1] : null,
            mate: mate ? +mate[1] : null,
            pv: moves,
            depth: depth ? +depth[1] : 0
          };
        }
      }, 10);

      const w = line => {
        try { this.proc.stdin.write(line + '\n'); } catch (e) { finish(e); }
      };
      w(`setoption name MultiPV value ${multiPv}`);
      w(`position fen ${fen}`);
      w(`go movetime ${movetimeMs}`);
    });
  }

  stop() {
    this.alive = false;
    this._buf = '';
    if (this.proc) { try { this.proc.kill(); } catch (e) {} }
    this.proc = null;
  }
}

/** FIFO pool: at most `size` engines alive, everyone else waits their turn. */
class EnginePool {
  constructor({ path, size = 1, args } = {}) {
    this.size = size;
    this.engines = [];
    this.waiting = [];
    this.path = path;
    this.args = args;
    this.ready = false;
    this.attemptedPaths = [];
  }

  /** Candidate binaries, most explicit first. */
  candidates() {
    return [
      this.path,
      process.env.STOCKFISH_PATH,
      '/tmp/stockfish',        /* where the Render build command puts it */
      '/usr/bin/stockfish',
      '/usr/games/stockfish',  /* Debian's stockfish package */
      'stockfish'              /* PATH */
    ].filter(Boolean);
  }

  async warm() {
    if (this.ready) return true;
    for (const p of this.candidates()) {
      if (this.attemptedPaths.indexOf(p) === -1) this.attemptedPaths.push(p);
      const e = new Engine(p, this.args);
      if (await e.start()) {
        this.path = p;
        this.engines = [e];
        for (let i = 1; i < this.size; i++) {
          const extra = new Engine(p, this.args);
          if (await extra.start()) this.engines.push(extra);
        }
        this.ready = true;
        return true;
      }
      e.stop();
    }
    return false;
  }

  async _acquire() {
    if (this.waiting.length) {
      const ticket = this.waiting.shift();
      ticket.resolve(null);
    }
    for (const e of this.engines) {
      if (!e.busy) return e;
    }
    if (this.engines.length < this.size && this.path) {
      const extra = new Engine(this.path, this.args);
      if (await extra.start()) {
        this.engines.push(extra);
        return extra;
      }
    }
    return new Promise(resolve => { this.waiting.push({ resolve }); });
  }

  _release(engine) {
    const next = this.waiting.shift();
    if (next) next.resolve(engine);
  }

  async run(task) {
    if (!this.ready && !(await this.warm())) throw new Error('engine unavailable');
    const engine = await this._acquire();
    engine.busy = true;
    try {
      return await task(engine);
    } finally {
      engine.busy = false;
      this._release(engine);
    }
  }

  stats() {
    return {
      ready: this.ready,
      path: this.path || null,
      tried: this.attemptedPaths,
      engines: this.engines.length,
      busy: this.engines.filter(e => e.busy).length,
      waiting: this.waiting.length
    };
  }

  stopAll() {
    this.engines.forEach(e => e.stop());
    this.engines = [];
    this.ready = false;
  }
}

module.exports = { Engine, EnginePool, MOVE_RE };
