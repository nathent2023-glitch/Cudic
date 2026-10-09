# Chess service

Stockfish behind a small HTTP API. The chess seed game asks it for moves; it does
not search locally any more.

## Endpoints

| Route | Body | Returns |
|---|---|---|
| `GET /health` | — | `{ ok, engine, path, ... }` |
| `GET /warm` | — | `{ ok, engine, ms }` — starts the engine, then answers |
| `GET /ladder` | — | the 100–3000 rating steps |
| `POST /move` | `{ fen, elo }` | `{ move, elo, band, depth, ms, lines, multiPv, playedCp, lossCp }` |

`move` comes back as UCI (`e7e5`). On a free Render instance the first request
after a cold start can take ~30s; call `/warm` when the page opens so the engine
is already up when the player moves.

## The ladder

One engine, rated by how much quality it is willing to throw away:

- `multiPvFor(elo)` widens the candidate list as the rating drops — 2 moves at
  3000, 7 at 100. A beginner really does consider worse moves.
- `missTolerance(elo)` is how many centipawns that rating will give up on one
  move, and it sets the sampling weights.

The result, measured over the same positions at each band:

| Elo | worst-case loss | behaviour |
|---|---|---|
| 3000 | 0cp | takes every tactic, 6/6 mate in one |
| 1200 | 140cp | misses some tactics |
| 100 | ~9700cp | walks past a mate in one, about 4 moves in 16 |

There is no separate weak engine and no local fallback. If the service is down,
the game says so rather than pretending the bot moved.

## Running it

```powershell
npm install                     # no runtime dependencies
$env:STOCKFISH_PATH = "C:\path\to\stockfish.exe"
$env:PORT = 3001
node server.js
```

### Env

| Var | Default | Notes |
|---|---|---|
| `STOCKFISH_PATH` | searches PATH | the engine binary |
| `PORT` | `3001` | |
| `ENGINE_MOVETIME` | `350` | ms per move |
| `ENGINE_MULTIPV` | `8` | ceiling; `multiPvFor` scales under it |
| `ENGINE_POOL` | `2` | engine processes |
| `QUEUE_MAX` | `12` | requests queued before 503 |
| `RATE_MAX` | `120` | moves per IP per minute |

## On Render

Root directory `chess-server`, build command `apt-get install -y stockfish`.
Free tier. `render.yaml` at the repo root is deliberately untouched — it belongs
to the existing services.

The page picks the host automatically: `localhost` talks to `:3001`, everything
else to the deployed URL in `CHESS_API`.

## Checks

```powershell
$env:STOCKFISH_PATH = "$env:TEMP\opencode\sf\stockfish\stockfish-windows-x86-64-universal.exe"
node check.js
```

26 checks against the real engine: input validation, FEN injection, impossible
positions, MultiPV, mate finding, the ladder ordering, rate limiting.

## Licence

Stockfish is **GPLv3**. This service is distributed under the same terms, and
the in-game docs carry the attribution.
