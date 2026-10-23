# AGENTS.md — Cudic

Everything an agent needs to work in this repo without rediscovering it.
Read this before touching code. Section 12 (Gotchas) is the one that saves you.

---

## 1. What this is

**Cudic** (renamed from **Glox** in commit `5add766`) — a browser tool for building
and playing small games/sites: chat lobbies, a game gallery, a scene/game editor,
theme packs, and a VS Code workbench shell at `/studio`.

- **Not open source.** `README.md` is an all-rights-reserved notice. Don't publish,
  fork, or paste this code anywhere.
- Repo: `nathent2023-glitch/Cudic`. Primary branch **`master`**.
- Split deploy: static frontend on **Vercel**, Node API/WS on **Render**.

### Two editors, don't confuse them

| Route | What it is | Palette |
|---|---|---|
| `/editor` | The **classic** editor (legacy, still shipped). Design doc says it's exempt from the light theme. | dark |
| `/studio` | **Cudic Studio** — VS Code workbench via `@codingame/monaco-vscode-api`. This is where active work happens. | dark, IDE |

`design.md` now says "`/editor` is now Cudic Studio" — that's aspirational copy.
Both routes exist and are served.

---

## 2. Stack

- **Node + `server.js`** — one hand-rolled HTTP server: static files, REST API,
  WebSocket, email verification, AI proxy. No Express; routes are `if (url.pathname === ...)`.
- **`ws`** for realtime; **`@supabase/supabase-js`** for auth + DB + storage;
  **`nodemailer` / `resend`** for verification mail; **`dotenv`**.
- **Frontend**: plain HTML/CSS/JS in `public/`. No framework, no bundler for the
  classic pages — vanilla script tags. Studio is the exception (Vite).
- **Studio**: Vite 6 → `public/studio/` (gitignored, built locally/on Vercel),
  monaco-vscode-api 37.x, `esbuild` for ad-hoc bundling.
- **Design system**: `design.md` is the single source of truth for color/type/spacing.

### Dependencies actually in use
`ws`, `@supabase/supabase-js`, `dotenv`, `nodemailer`, `resend` (root).
Studio: `@codingame/monaco-vscode-*` (~40 override packages), `monaco-editor`,
`vscode` (alias to the extension API), `gsap`, `jszip`, `mammoth`.
Classic pages: **Web Awesome 3.14.0** via pinned CDN (`sidebar.js` injects default
theme + `webawesome.loader.js`; components load on demand only when a `<wa-*>`
tag exists). No build step, no framework — do not add one. Hand-roll visuals to
`design.md`; use `wa-*` only for behavioural widgets (dialog, dropdown, tooltip,
toast, tabs). Dark mode is our own token block (`:root[data-theme="dark"]`,
`glox_theme` = dark/light, dark default) — `wa-dark` unused.

---

## 3. Commands

```powershell
# root
npm start            # node server.js  → http://localhost:3000
npm run dev          # same thing

# studio (REQUIRED before testing /studio changes — output is gitignored)
cd studio
npm run build        # vite build → ../public/studio/   (~1-2 min, 13MB bundle)
npm run dev          # vite dev server

# islands (React components inside classic pages — output is COMMITTED)
cd islands
npm run build        # vite build (lib IIFE) → ../public/islands/  (~5s, 657KB)
```

- Shell is **PowerShell 5.1**: use `;` not `&&`. Quote paths with spaces.
- **Restart `server.js` after editing it** — no hot reload.
- **Rebuild Studio after editing anything under `studio/src/`** — `public/studio/`
  is gitignored, so what you see in the browser is always the last build.
- **Rebuild islands after editing anything under `islands/src/`** — unlike
  Studio, `public/islands/` IS committed (Vercel builds no JS), so rebuild
  then commit the bundle. Bump `islands.js?v=N` + `cudic-islands.css?v=N`
  (currently **v7**) on using pages after rebuilding.
- Bump `sidebar.css?v=N` across all pages when editing `public/sidebar.css`
  (currently **v24**) — pages cache CSS aggressively. Same for
  `sidebar.js?v=N` (currently **v14**) / `client.js?v=N` (currently **v7**) after editing those.
  New shared scripts take `?v=1` (`ctheme.js`, `csel.js`).
- **No test suite exists.** Verification = build + open `http://localhost:3000`
  and check the console. Playwright MCP is **disabled**; the browser tools that
  work here are `chrome-devtools` (screenshots return media inline when no
  `filePath` is given) and `public-browser`. Headless Chrome `--screenshot` is
  unreliable in this environment — do not use it to verify visuals.

---

## 4. Layout

```
server.js                 # ~4000 lines: HTTP + API + WS + AI proxy + email
public/                   # the classic app (served at Vercel output root)
  index.html              # marketing landing (dark, animated, GSAP)
  login.html              # auth split screen (sign in / create / guest)
  chat.html  lobbies.html # chat
  servers.html            # server list + comments
  games.html  view.html   # gallery + game view (GSAP motion)
  play.html  run.html     # play + run harness (document.write player)
  profile.html            # profile
  themes.html             # theme pack store
  editor.html             # classic editor (65KB, legacy)
  sidebar.css  sidebar.js # shared rail nav on every page
  theme-engine.js         # window.CudicTheme — pack boot/apply/install/clear
  config.js  auth.js  client.js   # shared client helpers
  cudic_sfsvg.svg         # C mark — favicon + rail badge  (NEVER DELETE)
  cudic_sfpng.png         # PNG version of same           (NEVER DELETE)
  cucid.svg               # full wordmark (user's logo)   (NEVER DELETE)
  fonts/                  # incl. "Nine Circles" (free commercial license)
  assets/kenney/          # 674 CC0 game/board-game/emote icons + manifest.json
                         # (served statically; picked by glox.insertIcon)
  packs/                 # static theme packs: index.json + <pack>/manifest.json
                         # (NOT themes/ — a /themes dir shadows the /themes rewrite on Vercel)
  studio/                 # ← GITIGNORED build output
studio/
  vite.config.js          # base '/studio/', outDir '../public/studio'
  src/main.ts             # workbench bootstrap, service overrides, title bar icon
  src/glox.ts             # Preview tab, Run, context menus, preview assembly
  src/project.ts          # save/import/export/publish/delete project commands
  src/cudic-ai/           # ← the AI panel (see §7)
supabase/
  schema.sql              # base schema
  migrations/             # 4 dated migrations
design.md                 # design system source of truth
PROJECT_MEMORY.md         # credentials index + user preferences
vercel.json               # rewrites + cache headers + build command
render.yaml               # Render service (PORT 10000)
```

### Pages & routes
Vercel rewrites (`vercel.json`) map extensionless paths → `.html`:
`/` → index (landing), `/login` → login.html, `/profile`, `/chat`, `/games`,
`/themes`, `/editor`, `/servers`, `/lobbies`, `/studio` → `studio/index.html`.
`server.js` mirrors all of these for local dev.

Cache rules: `.html` = `no-cache`; `.js`/`.css` = `max-age=0, must-revalidate`;
`/studio/assets/*` = `immutable, 1y`.

---

## 5. server.js map

| Lines (approx) | What |
|---|---|
| 15–30 | `validName`, `rateLimit(key,max,windowMs)`, `clientIp` |
| 34–100 | mail transport (Gmail API → Resend → Brevo, HTTPS-only), `MIME` map, `cors` |
| 685 | `readBody(req)` |
| 726–752 | **`AI_HOSTS` whitelist** + `/api/ai/fetch` proxy |
| 872 / 952 | `walk()` — studio project file tree + assets |
| 1080–1114 | `broadcast`, `getLobbyList`, `sendLobbyListToAll` |
| 1114 | `saveMessage(lobby, userId, displayName, text)` |
| 1333 | `server.listen(PORT)` — logs `Cudic is running → http://localhost:${PORT}` |

### HTTP endpoints
```
POST /auth/send-code  POST /auth/verify-code    GET  /auth/check-verified
GET  /auth/verification-required (login hard gate — same rule as needVerified)
GET  /auth/callback (GitHub OAuth)
GET  /api/session               GET|PUT /api/profile
GET  /api/messages              (newest 100, oldest-first; lobby list runs over WS, not REST)
GET|POST /api/servers           GET /api/servers/mine
GET  /api/games                 GET|POST /api/games     GET /api/games/mine
GET  /api/games/:id/thumbnail   ← card art as real image bytes (1-day cache)
GET  /api/games/:id/live        ← in-memory room head-count (`{playing}`) for the
                                  game page's pill; unauth, no-store, no DB
POST /api/ai/fetch              ← the AI proxy (see §7)
GET  /favicon.ico               → serves public/cudic_sfsvg.svg
GET  /themes                    theme pack store
POST /api/session/claim|heartbeat  DELETE /api/session
GET|PUT|DELETE /api/saves/:gameId  ← account-bound saves (100KB cap)
POST /api/scratch/import           ← .sb3 / Scratch URL → split player files
+ static file serving from public/
```
WebSocket: `new WebSocketServer({ server })` — lobby presence, typing, broadcast,
lobby list fanout. Homepage listens as a watcher.

### Auth pattern
Every gated route: pull `Authorization: Bearer <supabase jwt>` →
`supabase.auth.getUser(token)` → 401 `{"error":"Sign in to ..."}` if bad.

### Email verification (hard gate, total coverage)
`needVerified(user, res)` 403s `email_unconfirmed` for unconfirmed email
signups (GitHub OAuth + pre-2026-10-11 accounts exempt via
`userUnconfirmed()`). Invariant: **every authenticated state-changing
endpoint calls it** — the only ungated writes are the session/seat trio,
play counts (open by design), read receipts (read-path), and the auth
endpoints themselves. Login + chat boot bounce unconfirmed users to the
code screen (`GET /auth/verification-required`, same rule). A daily
`purgeUnconfirmed()` sweep deletes email accounts still unconfirmed after
24h (profile + owned rows cascade from `auth.users`), so the user list
holds real accounts only.

### Reports + moderation (plan.md 2.1–2.2)
`POST /api/reports` takes pack/game/message/user (reason required, 20/hour
per user). Message reports require seeing the room; user reports reject
self-reports. Chat Flag buttons arm from history ids + a `message_saved` WS
patch keyed by client `cid` — never await the insert before broadcast.
Mod-only: `GET /api/reports/queue|mine`, `POST /api/reports/:id/action`
(dismiss/reviewing/actioned/unpublish/delete_message, all in
`moderation_actions`), `/moderate` page. Moderators = `moderators` table
(auth UUIDs, service-role only); needs migration
`20261014120000_moderation.sql`. Pre-migration the queue safely 403s.

### Onboarding + account deletion
`/welcome` wizard (Username → Password for email accounts → Style accent),
non-skippable UI, fenced at login boot, post-auth routing, and chat OAuth
return — all on explicit `setup_done === false` only. `users.setup_done`
needs migration `20261015120000_profile_setup.sql` (grandfathered true).
`DELETE /api/account` (seat-checked) purges storage best-effort, then
deletes the auth user; rows cascade. Profile Security holds the delete
modal (typed random code + hold-to-confirm, no captcha provider).

### Music tracks (account cloud saves)
`music_tracks` table (owner, title, data jsonb, service-role only) +
`/api/music` CRUD (verify-gated, seat-checked writes, 100KB cap).
`music.html` syncs signed-in users (debounced PUT/POST, localStorage
mirror); guests stay local. `?track=` deep link; switching reloads so
one-shot builders never double-bind. Needs migration
`20261014130000_music_tracks.sql`. Your Projects tab unifies Studio
projects + unpublished pack drafts (`/themes?edit=`) + tracks.

### Single-seat sessions (one live seat per account)
Client mints a random seat id at login (`cudic_seat` in localStorage; fresh
mint = takeover) and the leader tab heartbeats it every 30s
(`POST /api/session/heartbeat`; 90s expiry; no row = grandfathered free
pass). Page loads claim ONLY when minting fresh (no seat) or after Take
over; normal loads heartbeat (refresh-or-learn, never kicks). A real
takeover 403s the old seat (`{"error":"session_superseded"}` on checked
paths: WS join/send, AI proxy) → paused banner with Take over (fresh seat
+ claim + reload). Same-browser tabs share the seat and stand down
silently when another tab leads (no banner — they keep working).
Tabs elect a leader via `cudic_tab_lock` (10s stale, 5s refresh) —
the server can't tell tabs apart; only the leader beats. Seat travels as
`X-Seat` header / `msg.seat` / body field. Table: `active_sessions`
(RLS locked, service key only). Tested end-to-end (20 checks, temp user,
cleaned up) — see `/api/session/claim|heartbeat` + `seatAlive()`.

### Cloud game saves (progress follows the account)
Table `game_saves` (pk(user_id, game_id), `data` jsonb, RLS locked).
Endpoints above; all seat-checked (403 `session_superseded`). Games never
touch the token (sandboxed iframes) — `public/cudic-save.js` (`CudicSave.load/
save/clear`, local mirror + debounced cloud, legacy-key import) talks to the
parent via postMessage; `view.html` mediates with its own session and shows
guests a one-time sign-in nudge (no guest persistence). The Studio preview
mediates too (`registerPreviewSave` in `glox.ts`), but keeps testing **local**:
its own slot in the workbench's storage keyed by project id, never the cloud
row — a preview cannot overwrite a player's save (or the author's), and it
works signed out. A never-saved project shares the `draft` slot.
Last-write-wins by `updated_at`; mid-run boards don't sync (bests + full
clicker-style state only). Tested end-to-end (17 checks, temp user+games,
cleaned up).

### In-game multiplayer (rooms over the same WebSocket)
`public/cudic-multi.js` is the game-side API: `CudicMulti.join('code')` →
`net.send(obj)` / `net.on('open'|'peers'|'msg'|'error')` / `net.id` / `net.leave()`.
Same security shape as saves — the sandboxed frame holds neither the token nor a
socket; the host page mediates (`multi_join`/`multi_msg`/`multi_leave` over the
existing WS, one connection per room, `onclose` rejoins while the game still
wants the room). Two hosts: **`view.html`** for players, and **`glox.ts`
(`registerPreviewMulti`)** for the Studio preview, which joins `<project>:preview`
so a preview never collides with the published game's rooms. `embed.html` and
`play.html`/`run.html` do not mediate — `join()` reports a clear error there
instead of going quiet. Rooms are **anonymous on purpose** (guests must be able
to play along) and keyed `game:room`, room code defaulting to `'main'`.

Identity comes from the server, never the client: a join may carry the login
token, and if it verifies the peer is `users.display_name` with their account id
attached; otherwise the peer is `'Guest'` (a client-supplied name is ignored, and
a peer id already taken in the room is replaced, so nobody can clone a name or a
session). Caps live in `server.js`: 32 per room, 8 KB per message, **per
connection** 20 joins/min and 200 msgs/10s (the IP buckets — 400 joins/min, 8000
msgs/10s — are only a backstop against one host opening a socket fleet; per-IP
keying made a whole school share one budget). Each peer's account id stays on the
host page: the game frame receives names only.

"Playing now" is `liveCount(game)` over the in-memory rooms, served as `playing`
on `GET /api/games` and on the single-game `GET` (so the gallery badge needs no
extra request and the game page has a number before the game joins). Game rooms
are separate from `lobbies`/`clients`, so chat, seats and the lobby list are
untouched. Verified with a 30-check Node WS test (incl. shared-IP fairness,
name/id spoofing, live counts returning to 0) + a real browser frame relaying to
a Node peer both ways. **Restart `server.js` after editing this path**, and
remember a new mediator must stamp `req` on every reply it sends to the game or
the game-side router drops it.

Moderation: nothing in a room is stored, so a game's chat is not reviewable after
the fact. The game page's live strip therefore reports a **player by account**
(`content_type: 'user'` through the existing report modal — `window.CudicReport`
in `islands/src/islands/report-button.tsx`), and the copy tells the reporter to
write what happened because the note is the only evidence. Guests have no
account and cannot be reported by id; report the game there.

### Env (all in gitignored `.env`, never commit)
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`, `PORT`,
plus optional `GMAIL_CLIENT_ID/CLIENT_SECRET/REFRESH_TOKEN/SENDER`, `RESEND_API_KEY`, `GITHUB_CLIENT_SECRET`.
`.env.example` lists the core four. `PROJECT_MEMORY.md` indexes where secrets live
(it contains public IDs only — client ID, project ref — those are fine).

---

## 6. Database

Supabase project `opimjwmgmzwapkzgxvhk`.
Tables: `users`, `lobbies`, `messages`, `games`, `game_comments`, `servers`,
`server_members`, `active_sessions`, `game_saves`. Trigger `on_auth_user_created` creates the profile on signup.

**Chat history is permanent.** Nothing deletes `messages` except the moderator
`delete_message` action. `lobbies.persistent` is vestigial (the old 2h sweeper
that emptied `persistent = false` rooms was removed — do not bring it back); it
is written `true` on create and every existing row was backfilled to `true`.
`GET /api/messages` serves the **newest** 100, reversed to oldest-first, because
the client renders history top-down.

Migrations:
- `20260919181404_studio_files.sql` — `games.files jsonb` + storage policies
- `20260921182000_lobby_creator_set_null.sql` — FK `ON DELETE SET NULL`
- `20260923120000_studio_assets.sql` — `games.assets jsonb`
- `20260924120000_game_comments.sql` — comments table + RLS policies
- `20261003120000_chat_channels_dm.sql` — lobbies get `kind`/`server_id`/`topic`/`is_private`, `server_members.role`, `conversation_members` (access), `conversation_state` (read receipts), `friendships`; legacy rooms deleted
- `20261003130000_avatars.sql` — public `avatars` storage bucket + policies
- `20261003140000_server_rules.sql` — `servers.rules`, `server_members.rules_accepted_at` (grandfathered); server create endpoint reads channel bundles from the `SERVER_TEMPLATES` map in `server.js` (`GET /api/server-templates` serves the picker)

RLS: read-for-all on most, insert for authenticated, delete for owner.
Storage policies let anyone read game assets, authenticated upload, owners manage/delete.

MCP Supabase tools are available (`supabase_list_tables`, `supabase_execute_sql`,
`supabase_get_advisories`, …). Prefer **read-only** inspection; run DDL only when
asked, and check advisors after schema changes.

---

## 7. Cudic AI panel (the big recent feature)

### Architecture — this is the part that surprises people
**There is no WebviewViewPane in this build**, so sidebar view contributions
(`contributes.viewsContainers` / `views`) **cannot render**. Anything that tries
to open as a sidebar view will silently do nothing.

Instead the panel is a **direct DOM mount**:
1. `registerCudicAi(shadowRoot)` in `extension.ts` builds `#cudic-ai-panel` and
   appends it to the workbench's `.part.auxiliarybar` (the right bar).
2. Header bar + a **sandboxed iframe** (`sandbox="allow-scripts"`, no `allow-same-origin`,
   `srcdoc`) loads `chat.html` — all UI lives there, isolated from the workbench.
3. Toggle: a ✦ button inserted next to `#glox-title-icon` in the title bar
   (`mountTitleBarCudicIcon()` in `main.ts`).
4. Open via palette command **`Cudic AI: Open chat`** (`registerAction2`) —
   keybind `ctrl+shift+alt+p` opens the command palette itself.

Bridge: `postMessage` / `message` events between parent and iframe.
Parent handlers (`handlePanelMessage`): `ai:ready`, `ai:saveSettings`,
`ai:models`, `ai:test`, `ai:chat`, `ai:stop`, `ai:apply`.
Outbound: `postToPanel(...)`.

Manifest registration is **import-time** and manifest-only (`registerExtension`
with `LocalWebWorker`, `icon: '$(sparkle)'`) — it exists so the extension host is
happy, not because views are used.

### Files
| File | Role |
|---|---|
| `studio/src/cudic-ai/extension.ts` | main side: mount, message handlers, `resolveModel`, `friendlyError`, `gatherContext`/`systemPrompt`, autocomplete, `setSupaToken`, `publicSettings` |
| `studio/src/cudic-ai/chat.html` | all UI: gate / providers / key / options / chat screens, ASCII noise, motion CSS |
| `studio/src/cudic-ai/providers.ts` | **53 provider presets**, `publicModels` flag, `isLoopbackUrl` |
| `studio/src/cudic-ai/llm.ts` | `streamChat` (openai-chat / anthropic / gemini SSE), `fetchModels`, `routedFetch`, `friendlyError`, `suggestModels`, tool-call defs + OAI tool delta parsing |
| `studio/src/cudic-ai/skills.ts` | `SKILLS` — premade prompt packs (`cudic` on by default, `taste` opt-in), condensed from design docs |

### Settings & keys
- Stored in page `localStorage['cudic-ai']` as
  `AiSettings { provider, model, baseOverride, completeOn, completeModel, keys, modelLists, skills }`.
- `publicSettings()` returns a **safe projection**: `hasKey` boolean + `keyed[]`
  (which providers have keys — **presence only, never values**). Keys never leave
  the page except as an `Authorization` header on the outbound request.
- Supabase JWT pushed into the panel by `pushSupaToken()` (`main.ts`, every 60s)
  reading `sb-opimjwmgmzwapkzgxvhk-auth-token`.

### Model catalogs — how "all models" works
`canList(p, pid)` in `chat.html` is the gate:
```js
if (p.publicModels || p.loopback) return true;        // keyless catalogs
return keyed.indexOf(pid) !== -1;                     // or you have that key
```
- **Keyless/live**: OpenCode Zen (`opencode.ai/zen/v1/models`, 82→84 IDs),
  OpenRouter (`openrouter.ai/api/v1/models`, 458 IDs), local Ollama/LM Studio.
  Expand the company row → list fetches and the full lineup renders inline.
- **Keyed**: expanding pulls the live catalog once a key for that company is saved.
  Saving a key clears `fetchedFor`/`FETCHERR` so the catalog refreshes.
- **No endpoint** (Anthropic, Perplexity…): curated `models[]` + note "curated".
- Results merge into `LISTS[pid]`; errors land in `FETCHERR[pid]` and render
  inline as `⚠ <provider> says: …` — they used to vanish silently.
- Lists persist in settings with fetch timestamps (`fetchedAt`); eligible
  catalogs (public/local/keyed) auto-refresh in the background when older
  than 24h (`refreshModels`, staggered 800ms). `ai:saveSettings` preserves
  both maps — it used to wipe them.
- `fetchModels` (`llm.ts`) handles shapes: `j.data ?? j.models`, string-or-object
  entries, and Google's `models/gemini-…` prefix stripping.

### The proxy — `/api/ai/fetch`
Cloud LLM calls **must** go through the server (browsers can't hold provider keys
safely and CORS blocks it). Loopback (Ollama/LM Studio) is deliberately **rejected
by the proxy** and called directly from the browser instead.

Rules, in order:
1. No `Authorization: Bearer <supabase jwt>` → **401** `Sign in to use cloud models.`
2. `supabase.auth.getUser(token)` fails → **401** same message.
3. Target must parse, be `https:`, and have `hostname ∈ AI_HOSTS`
   (or `*.openai.azure.com`) → else **403** `Target not allowed.`
4. Loopback/private-range hostnames (`localhost|127.|0.|10.|192.168.|172.16-31.|::1|fc00:|fe80:`)
   → **403** (SSRF guard).
5. Otherwise forwards a whitelisted header subset.

`AI_HOSTS` (~50 entries) lives at `server.js:726`. **Adding a provider whose host
isn't in that set will 403 at runtime** — that's the #1 integration bug here.

### Autocomplete
Monaco `registerInlineCompletionsProvider` — ghost text, gated on `completeOn`
and an active key.

### Skills & tools
- **Skills** are composer chips (`📄 active file` + `✦ <skill>`); selection
  persists in `AiSettings.skills`, sent with every `ai:chat`, appended to the
  system prompt. `cudic` (platform/design rules) defaults on, `taste` (design
  mode) defaults off. Catalog ships in `ai:init`.
- **Tools** (`save_file` / `read_file`) run as a ≤4-round loop inside `ai:chat`;
  each call posts `ai:tool` → a `.toolnote` line in the streaming bubble.
  `save_file` reuses `normalizeApplyPath` (same guard as Apply) + `TEXT_EXT`.
- Tools are sent **only when `preset.format === 'openai-chat'`** (~50 presets);
  anthropic/gemini get skills but no tool loop. Check `useTools` in `extension.ts`.
- **Setup-screen navigation gotcha**: `decide()` early-returns while on
  providers/key/options (by design — don't yank mid-setup), so those screens'
  Back buttons route through `exitSetup()`, not `decide()` directly.

### UI design direction (user taste — follow it)
- **Monochrome zinc/white, Codex-style.** The user explicitly rejected purple:
  *"WHY DO U HAVE TO PUT PURPLE EVERYTHING"*. Also rejected an earlier shadcn-ish
  pass as *"no taste"*. Do not reintroduce purple gradients or generic AI styling.
- Gate: ASCII FBM noise backdrop (canvas, 4-octave value noise, glyph ramp
  `' .·:;=+x#%@'`, ~90ms frames, radial vignette, static frame under
  `prefers-reduced-motion`), centered ✦ brand, bottom pill stack
  (white "Add a provider" / dark "Use API key" / text "More options").
- Screens: providers (searchable, **expandable company → model rows**, current
  model gets ✓) → key (model + key + Save/Test) → options (ghost autocomplete,
  completion model, custom endpoint) → chat (bubbles, avatar, typing dots, code
  blocks with Apply/Copy, error bubbles with Retry, suggestion chips).
- Motion: gate rise/stagger, screen fades, message slide-in, streaming avatar
  pulse, pill hover lift, send scale — **all `prefers-reduced-motion` guarded.**

---

## 8. Studio (`studio/`)

- `vite.config.js`: `base: '/studio/'`, `outDir: '../public/studio'`,
  `emptyOutDir: true`, `target: 'esnext'` (top-level await; school Chrome is current),
  `chunkSizeWarningLimit: 20000`, `worker.format: 'es'`.
- **Custom plugin `loadVscodeCssAsString`** — forces VS Code `.css` under
  `node_modules/@codingame/*` to load as `?inline` strings so they can be injected
  into the shadow root. It **normalizes Windows backslashes** before matching;
  the upstream regex assumes POSIX. Don't "simplify" it away.
- Workbench mounts in `#workbench` as a **ShadowRoot** — all VS Code CSS goes
  through it. Style leakage goes both ways; test both editors if you touch CSS.
- 40+ `getServiceOverride` imports in `main.ts` — these are load-bearing; removing
  one typically kills a workbench part silently.
- Workers: editor, extensionHost, textmate, search, outputLink.
- `main.ts` also: `registerProjectCommands()`, `registerCudicAi(shadowRoot)`,
  `pushSupaToken()`, `mountTitleBarCudicIcon()`.

### Commands
```
glox.saveProject | glox.importFiles | glox.importFolder | glox.exportProject
glox.publishProject | glox.unpublishProject | glox.deleteProject
glox.setThumbnail | glox.openPreview | glox.run | glox.leaveStudio | glox.toggleSidebar
glox.runPython | glox.installPythonPackage | glox.addPackage
glox.importScratch   (.sb3 file or shared Scratch link → playable project)
glox.insertIcon       (Kenney CC0 icon library → assets/icons + <img> at cursor)
cudic ai:  Cudic AI: Open chat
```
Note the **`glox.` prefix is intentional and kept** — command IDs and storage keys
were not renamed during the Cudic rename (only visible strings were). Same reason
the Supabase anon key storage key still says `sb-opimjwmgmzwapkzgxvhk-…`.

`glox.ts` builds a preview by **assembling project files**: inlining local CSS/JS
into the HTML, resolving `data:`/relative refs against the project map, wrapping
legacy single-file games. `assemble()` / `injectAssetUrls()` / `previewHtmlFor()`.

### Runtimes (no terminal, no backend exec — browsers can't run OS programs)
- **Python**: `glox.runPython` (Run routes `.py` files here too) executes the open
  file with Pyodide 0.26.4 (WASM, jsdelivr CDN, ~10MB first load) inside the
  preview frame; `micropip` preloaded. `glox.installPythonPackage` inserts
  `import micropip` + `await micropip.install("name")` at the top of the file.
- **npm packages**: preview `assemble()` rewrites bare imports to `esm.sh` URLs
  (`rewriteBareImports`), skipping names the project's own importmap pins.
  Static CSS imports (`import 'pkg/style.css'`) lift to `<link>` tags;
  dynamic `import('*.css')` can't lift and fails at runtime (documented).
  `glox.addPackage` inserts a full `https://esm.sh/<pkg>` import (works in
  previews AND published games — publish pipeline untouched by design).
  Inline scripts carrying static import/export get `type="module"` automatically
  (`scriptTag`); the legacy single-file preview hoists imports above its console
  shim (`splitImports`). Pure helpers live in `src/npmutil.ts` (zero imports);
  unit-test with `esbuild src/npmutil.ts --format=cjs` + node assertions.
  Limits (physics, not missing features): no Node built-ins (`fs`, `net`,
  `child_process`), no native binaries, no `require()`, no build scripts.
- **Multi-file ES modules** run in the preview *and* in published games: a
  relative `import './x.js'` between project files is rewritten to an import-map
  id (`cudic~<path>`) whose target is a `data:` URL of that file — transitively,
  cycles included. Preview side: `mapModuleImports` / `drainModuleSlots` /
  `finishModuleMap` in `studio/src/npmutil.ts`. Player side: the same algorithm,
  mirrored in `public/run.html`. The map is merged into the project's own
  `<script type="importmap">` when it has one (a second map tag is
  newer-Chrome-only and older Chrome then drops both). Two limits stay: CSS
  `@import './y.css'` between files, and paths built in JS
  (`new URL('./a.png', import.meta.url)` — the base is a data: URL).
- **`fwd` in `public/run.html` is two `<script>` tags** (console shim, then
  `__CUDIC_BIN__`), not one. A missing `<\/script>` between them made Chrome
  throw on every `document.write` *and* left `window.__CUDIC_BIN__` undefined,
  so runtime-fetched assets silently had no map — keep them separate.
- **Legacy scene games**: classic-editor rows carry code in `scene` with no
  `files`; Studio `bootProject` converts them on the fly via `sceneToFiles`
  (same module) into an editable single-file game — saving persists it.

### Scratch import (`glox.importScratch`)
`POST /api/scratch/import` unpacks `.sb3` (base64) or a shared Scratch project
and returns 4 files Studio drops into the workspace: `index.html` (player shell),
`scratch.js` (TurboWarp Scaffolding loader), `project.json` (the editable source),
`assets.js` (assets as data: URLs). Root dep: `jszip`.
- **Scratch 403s direct server-side `projects.scratch.mit.edu/<id>` downloads.**
  The token dance (trampoline metadata → `?token=`) is the only working path and
  its token API rate-limits bursts → one 1.5s retry. `.sb3` upload is the reliable
  route when a link fails.
- **The token endpoint returns either an `.sb3` zip or bare `project.json`**,
  depending on the project. JSON bodies carry no assets, so they're rebuilt by
  fetching every referenced `md5ext` from `assets.scratch.mit.edu/internalapi/asset/…`.
  Both shapes are handled; a heavy project (Geometry Dash = 104 assets, 10MB) works.
- Scaffolding is loaded from a pinned jsDelivr URL; `window.Scaffolding` exposes
  `{Scaffolding, Cloud, VM, Renderer, Storage, AudioEngine, JSZip}` — verified
  against 3.13.0. `addCloudProvider` must run **before** `loadProject`.
- Cloud variables map to `Cloud.LocalStorageProvider` (per-player, not synced);
  music projects use `scaffolding-full.js`, everything else `-min.js`.
- Known gaps: editing `project.json` alone does not change what runs (the loader
  holds its own copy — re-import or hand-sync both); TTS/translate stay silent,
  video sensing is blocked. Blocks are **not** translated to hand-written JS.

### Thumbnails
`games.thumbnail` (text, data-URL) — column, PUT field, and both `/api/games`
list endpoints already supported it; **only Studio lacked a control**.
`glox.setThumbnail` offers Upload / Capture-from-preview / Remove → `PUT`.
- Gallery card renders card art from `GET /api/games/:id/thumbnail` (fallback: cube SVG). The list endpoints (`/api/games`, `/api/games/mine`, `/api/games/liked`) send `has_thumb`, never the data URL — one 266KB list became 4KB. Single-game GETs still carry `thumbnail`.
- Images are downscaled to ≤1000px JPEG before saving (keeps rows small).
- **Capture is best-effort**: the preview iframe is `sandbox="allow-scripts"`
  (opaque origin) so the parent can't read it. Instead `mount()` appends
  `CAPTURE_SNIPPET`, which rasterizes its own DOM via SVG `foreignObject` and
  `postMessage`s the dataURL up; blank/tainted results are rejected.
- `project.ts` declares `previewBridge`, `glox.ts` fills it — **do not import
  glox.ts from project.ts** (glox already imports project; that's a cycle).

### Known benign console noise (do NOT "fix")
- `applyStateStackDiff` destructuring warning
- `Canceled: Canceled` (expected on tab/editor close)
- iframe sandbox warning
- `401` on `/api/profile`, `/api/servers`, `/api/mine` **when signed out** — expected

---

## 9. Sidebar (shared chrome)

- `public/sidebar.css` + `public/sidebar.js` on every page.
- **Fixed 60px icon rail, always collapsed**: flush full-height rectangle
  (no gaps, no rounded corners, `border-right` only). Labels never expand —
  hovering/focusing an item shows a `#railTip` tooltip pill (JS-positioned
  `fixed`, delegated so later-added server rows get tips too).
- Rail brand `.rail-brand`: **no white chip** (user removed it — wants raw art).
  Logo fetched as inline SVG via `[data-svg]` so per-path `--d` stagger can animate:
  `railIn` (slide from C) + `railGlow` (pulse). `<img>` fallback.
- Nav items: Chat, Servers, Games, Themes (`sbItem(href,key,icon,label)`), plus
  per-lobby links and an account row → `/profile`.
- Theme pack loader lives at the end of `sidebar.js`.

---

## 9b. React islands (`islands/` → `public/islands/`)

- Mount React components inside classic pages **without converting them**:
  `islands/src/loader.ts` scans `[data-island]` containers and
  `createRoot`-mounts the registry entry (`REGISTRY` name → component).
- New island: add `src/islands/foo.tsx` + registry line → `npm run build`
  → drop `<div data-island="foo">` + `<script src="/islands/islands.js?v=N">`
  (+ CSS link) in the page. Live examples: `new-menu` (New dropdown with
  Lucide icons) in the games topbar (mounts synchronously during parsing —
  the page's inline script grabs `#newDropBtn` by id, so deferred mounting
  throws and kills the rest of its script block); `report-button` (Report
  button + modal) on game pages (`view.html`, shown after the game loads).
  Button sweep/send-state styling in islands is adapted from the
  `cudic-test` button library (`ShineButton`/`LoadingButton`) restyled in
  `.isl-` CSS — islands ship no Tailwind, so library components are ported,
  never imported directly.
- Interop is read-only from host globals (`islands/src/cudic.ts`):
  `WS_URL` → `apiBase()`, `window.getAuthToken()`, `seatHeaders()` for
  writes. Never duplicate auth/config.
- Styles: hand-rolled `.isl-`-prefixed CSS using site vars
  (`--signal`, `--panel`, …) so islands follow light/dark + packs.
  No Tailwind in islands (collides with `sidebar.css`), no global selectors.
- React 19 self-contained in the bundle — independent of `editor.html`'s
  esm.sh React 18 pin. One bundle (~657KB/199KB gzip, cached) serves all islands.

---

## 10. Theme packs

- Store page `public/themes.html` at route `/themes`.
- Engine `public/theme-engine.js` → `window.CudicTheme`:
  `boot()`, `applyPack(id)`, `installPack(files)`, `clearPack()`, `previewScene(id)`.
- Static registry `public/packs/index.json`; packs in `public/packs/<id>/`
  (`manifest.json`, art). Shipped pack: **`anime-city-night`**
  (`sidebar.background` under a scrim, scene `city-night`, icons `neon`, motion `playful`).
- A pack's background outranks a plain CSS background (apply order matters).
- Backend `theme_packs` table was **deliberately deferred** — v1 is static files.
  Don't add it unless asked.
- **Theme lab is gone.** `theme-lab.js` and `logo-cucid.*` were deleted because the
  user said *"remove all the lab features"*. Do not resurrect it.

---

## 11. Design system (`design.md`)

Read it before building any classic-page screen. Headlines:

- **Light-only** for classic pages: ice-blue `--ink #E8EEFA`, white panels,
  hairline `--line #C9D5F0`, ink text `#2E2A4B`.
- **`--signal #7300FF` (electric violet)** is the *classic app's* primary — this is a
  different context from the AI panel. **`--ember #FF8C1A`** is reserved strictly
  for live/play moments (never nav, never structure).
- Type: **Epilogue** headings/buttons (500/600 only), **Satoshi** body (400/500),
  **JetBrains Mono** only for literal code/identifiers — never decorative labels.
- Anti-patterns named explicitly: acid-green-on-black, emoji as icons,
  ALL-CAPS micro-labels as hierarchy, generic "No X selected" empty states.
- Empty states follow the 4-step pattern (icon in soft signal circle → specific
  heading → one-line instruction → one primary button).
- Motion: **one deliberate moment per screen**; 150ms fades on route switch;
  hover only on activatable things.
- Voice: sentence case, active, buttons state the outcome ("Publish game", not "Submit").
- **Scope**: `/editor` + `/studio` stay **dark** (`#0d0e10` surfaces, `#855CD6`
  accents, `#FF8C1A` publish) — exempt from the light palette.

---

## 12. Gotchas — read twice

1. **NEVER delete the user's logo files.** `public/cucid.svg`, `public/cudic_sfsvg.svg`,
   `public/cudic_sfpng.png` — they were deleted once by mistake and the user was
   very upset. Same for `agora.db*` (Live Share) per `PROJECT_MEMORY.md`.
2. **The test browser shares the user's real session.** `localStorage` is shared —
   a real Gemini key has been observed in `cudic-ai` storage.
   **Never wipe `localStorage`. Never click "Send" in automated tests.**
   Verify by rendering/screenshots/reading only.
3. **Do NOT commit unless explicitly asked.** Push = Vercel + Render auto-deploy.
4. **Working tree should be clean** — the last batch (landing page, `/login`
   split, SEO files, screenshot crops) was committed as `d3cb2dc` and pushed to
   both branches. If you see modified `public/*.html` or `server.js`, something
   new is in flight: confirm with `git status` before assuming it is stale.
5. **The OneDrive copy** (`C:\Users\sophi\OneDrive\Desktop\Glox`) is a *separate*
   worktree parked on a **detached HEAD** (it used to hold `master`). It's only
   a mirror — do real work in `C:\Users\sophi\Glox`, directly on `master`.
6. **Branch**: `master` only (local = origin). `fix-inline-scripts` was
   merged and deleted on 2026-10-03; `fix-live-auth` still exists. Pushing
   `master` deploys Vercel + Render.
7. **New AI provider ⇒ add its host to `AI_HOSTS`** (`server.js:726`) or the proxy
   403s. Loopback hosts are intentionally *blocked* there and called directly.
8. **`public/studio/` is gitignored** — a fresh clone has no `/studio` until
   `cd studio && npm run build` (or Vercel's `buildCommand` runs).
9. **No `&&`** — PowerShell 5.1. Use `;` and `if ($?) { }`.
10. **CSS/JS cache** — bump `sidebar.css?v=N` (v24) on every page after editing it;
  same for versioned `sidebar.js` (v14) / `client.js` (v10).
11. **Restart the server** after any `server.js` edit; **rebuild Studio** after any
    `studio/src` edit. Neither auto-reloads.
12. **Command IDs keep the `glox.` prefix** — storage keys and IDs were not renamed.
    Only user-visible strings say "Cudic".
13. **No webview sidebar views** — see §7. This is the most common wrong turn.
14. **Never log or commit keys.** Keys live in `localStorage` and `.env` only.
15. **Copyright**: `README.md` forbids distribution. Don't push code to new remotes.

---

## 13. Deployment

| | |
|---|---|
| Frontend | Vercel → `https://cudic.vercel.app` |
| Backend | Render → `https://glox-o7rr.onrender.com` (service `glox-server`, `PORT=10000`) |
| Build | `cd studio && npm ci && npm run build`, output `public/` |
| Install | `null` (Vercel default) |

Render env vars are set in the dashboard, not files:
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`, `PORT`.

Pushing to `master` deploys both. Verify locally first.

---

## 14. Supabase MCP / tooling

- Supabase MCP tools are wired: list tables, run SQL, query logs, advisors,
  edge functions, migrations, generate TS types.
- Use `supabase_list_tables` before any schema change; `supabase_get_advisories`
  (security + performance) after DDL.
- CLI: `supabase` for local dev if present. `SUPABASE_ACCESS_TOKEN` is a
  read-only user env var.
- A **shadcn MCP** entry exists in `~/.config/opencode/opencode.jsonc`
  (`cmd /c npx -y shadcn@latest mcp`) — needs an opencode restart, and is mostly
  reference-only since this project has no React.

---

## 15. User preferences (from `PROJECT_MEMORY.md` + session history)

- **Beginner at web dev** — prefer simple explanations over jargon.
- **PowerShell** — `;` not `&&`.
- **No Google OAuth** — GitHub + email/password only.
- Wants **impressive UI**: dark IDE chrome, split layouts, glassmorphism.
- **Taste is opinionated and will push back hard** — see §7 UI direction.
  Purple in the AI panel is a hard no. "No taste" feedback means redo, not tweak.
- Product voice: sentence case, outcome-stating buttons.

---

## 16. Work state at time of writing

**Clean tree.** `master` = `origin` = `1fa91dd`, pushed 2026-10-23.
Verify with `git status` before assuming this still holds.

**Shipped in `1fa91dd`** (audit-fix + additions batch):
- Security: XSS fixes (chat avatar, servers icon, profile Liked), unpublished-draft
  leak gated to owner (+ thumbnail), WS message source guards, token scrub from
  URL, OAuth redirect no longer carries JWT, rightmost-XFF rate-limit keying,
  readBody caps, safeDecode (no process crash on bad `%`), generic error strings.
- Reliability: handleRequest crash wrapper, chat flood guard + typing cap,
  sendConversationsDirty throttle, sidebar N+1 parallelized, private servers
  beyond page-1 fetched for members, lobby list hides DM/channel names, reset
  scan loop 3→50, game field caps, thumbnail size cap, saves PUT errors surfaced.
- Additions: AI multi-turn memory, WS reconnect w/ backoff + re-join, save
  backup/restore on game page, related-games links on prerendered pages.
- Studio: model override dup removed, package pins to 37.1.0, bootProject sends
  owner token. client.js bumped to v10.

**Shipped earlier**: `d3cb2dc` marketing landing + `/login` split + SEO;
`7de42e7` thumbnails + model catalogs + rail animation; `17b6043` Cudic AI
panel, theme packs, sidebar push-aside, editor context menus, gallery motion.

**Live and verified after push**: server probes pass (malformed `%` → 404 not
crash, oversized body bounded, server stays alive); Studio build ✓ 56.64s.

**Deferred**: starter templates (A3), pack atomicity (needs migration), preview
zombie timers, `public/3d_models/` deletion (confirm first), `public/_next/`
must stay (live landing).

**Blocked / needs the user**: real end-to-end AI inference call (sign in, add key,
hit Test). AdSense resubmission needs custom domain + 2–3 weeks.
