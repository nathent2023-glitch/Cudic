/* Rating ladder, 100 to 3000.
 *
 * Stockfish's own UCI_LimitStrength is honest about *strength* but plays
 * badly-random below about 1000 — it keeps calculating and then throws a
 * queen away, which reads as broken. So we ignore its rating emulation and
 * downgrade the move choice ourselves: ask for the top few moves with their
 * evaluations, then sample among them by how much quality each one gives up.
 * A strong rating cannot afford any loss; a beginner treats a lost queen and a
 * passed mate as roughly the same mistake, and is therefore about as likely to
 * make either. Plausible misses, never free blunders.
 */
'use strict';

const ELO_MIN = 100;
const ELO_MAX = 3000;

/* missTolerance is how many centipawns this rating will happily give up on
 * one move. 3 at the top means "only the best move", 3000 at the bottom means
 * "several moves look fine to me". */
const TOL_MIN = 3;
const TOL_MAX = 3000;

const BANDS = [
  [2600, 'Grandmaster'], [2400, 'Master'], [2000, 'Expert'],
  [1600, 'Strong'], [1200, 'Intermediate'], [900, 'Club player'],
  [600, 'Casual'], [300, 'Novice'], [0, 'Beginner']
];

function clampElo(elo) {
  const n = Math.round(Number(elo));
  if (!Number.isFinite(n)) return ELO_MIN;
  return Math.max(ELO_MIN, Math.min(ELO_MAX, n));
}

function bandName(elo) {
  const n = clampElo(elo);
  for (const [floor, name] of BANDS) if (n >= floor) return name;
  return 'Beginner';
}

/* A move's value in centipawns from the side to move's point of view. Mate is
 * mapped to a large finite number so the arithmetic stays sane, and a nearer
 * mate scores higher. */
const MATE_CP = 10000;

function centipawns(line) {
  if (line.mate != null) return line.mate > 0
    ? MATE_CP - line.mate * 10
    : -MATE_CP + line.mate * 10;
  return line.cp == null ? 0 : line.cp;
}

/**
 * How much worse a move is allowed to be, in centipawns, at this rating.
 * Sharp players tolerate almost nothing; beginners are near-indifferent.
 * Log-interpolated so every rung of the ladder feels different.
 */
function missTolerance(elo) {
  const e = clampElo(elo);
  const t = (ELO_MAX - e) / (ELO_MAX - ELO_MIN);   /* 1 at 100, 0 at 3000 */
  /* The square root keeps the middle rungs usable. A straight log curve gives
   * 1200 about 200cp, which is tighter than a real 1200 player — they still
   * miss a fair share of what is on the board. */
  return TOL_MIN * Math.pow(TOL_MAX / TOL_MIN, Math.sqrt(t));
}

/**
 * Pick a move for a given rating from the engine's principal variations.
 * Weights each candidate by how much centipawns it throws away, so a weak
 * rating really does play sloppy moves while the top band never misses.
 * `rng` is injectable so tests can pin the choice.
 */
/* Past a certain point every bad move is equally bad — a beginner who walks
 * past a mate and one who hangs a queen are both losing, and treating them as
 * different would leave the weakest bands almost as accurate as the strongest.
 * So the loss is capped before it is turned into a weight. */
const MAX_CONSIDERED_LOSS = 2000;

function chooseMove(lines, elo, rng = Math.random) {
  if (!lines || !lines.length) return null;
  const tol = missTolerance(elo);
  let best = -Infinity;
  for (const l of lines) best = Math.max(best, centipawns(l));
  const weights = lines.map(l => {
    const loss = Math.min(MAX_CONSIDERED_LOSS, Math.max(0, best - centipawns(l)));
    return Math.exp(-loss / tol);
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < lines.length; i++) {
    r -= weights[i];
    if (r <= 0) return { ...lines[i], index: i };
  }
  return { ...lines[lines.length - 1], index: lines.length - 1 };
}

/** cp (centipawns, from the side to move) -> probability that side is better */
function winProbability(line) {
  const v = centipawns(line);
  if (v >= MATE_CP) return 0.999;
  return 1 / (1 + Math.pow(10, -v / 400));
}

/** For calibration runs: pick greedily (what the band would play if it never erred). */
function bestOf(lines) {
  if (!lines || !lines.length) return null;
  let best = lines[0];
  for (const l of lines) if (winProbability(l) > winProbability(best)) best = l;
  return best;
}

module.exports = {
  ELO_MIN, ELO_MAX, clampElo, bandName, missTolerance, centipawns,
  winProbability, chooseMove, bestOf
};
