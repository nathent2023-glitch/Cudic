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
```

- Shell is **PowerShell 5.1**: use `;` not `&&`. Quote paths with spaces.
- **Restart `server.js` after editing it** — no hot reload.
- **Rebuild Studio after editing anything under `studio/src/`** — `public/studio/`
  is gitignored, so what you see in the browser is always the last build.
- Bump `sidebar.css?v=N` across all pages when editing `public/sidebar.css`
  (currently **v9**) — pages cache CSS aggressively.
- **No test suite exists.** Verification = build + open `http://localhost:3000`
  and check the console. Playwright MCP is **disabled**; the browser tools that
  work here are `chrome-devtools` (screenshots return media inline when no
  `filePath` is given) and `public-browser`. Headless Chrome `--screenshot` is
  unreliable in this environment — do not use it to verify visuals.

---

## 4. Layout

```
server.js                 # ~1340 lines: HTTP + API + WS + AI proxy + email
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
| 34–100 | mail transport (`SMTP_*` env or Resend), `getMailFrom`, `MIME` map, `cors` |
| 685 | `readBody(req)` |
| 726–752 | **`AI_HOSTS` whitelist** + `/api/ai/fetch` proxy |
| 872 / 952 | `walk()` — studio project file tree + assets |
| 1080–1114 | `broadcast`, `getLobbyList`, `sendLobbyListToAll` |
| 1114 | `saveMessage(lobby, userId, displayName, text)` |
| 1318 | `cleanupNonPersistent()` |
| 1333 | `server.listen(PORT)` — logs `Cudic is running → http://localhost:${PORT}` |

### HTTP endpoints
```
POST /auth/send-verification    GET  /auth/check-verified
GET  /auth/verify               GET  /auth/callback
GET  /api/session               GET|PUT /api/profile
GET  /api/messages              POST /api/lobby/persistent
GET  /api/lobby                 GET|POST /api/servers   GET /api/servers/mine
GET  /api/games                 GET|POST /api/games     GET /api/games/mine
POST /api/ai/fetch              ← the AI proxy (see §7)
GET  /favicon.ico               → serves public/cudic_sfsvg.svg
GET  /themes                    theme pack store
+ static file serving from public/
```
WebSocket: `new WebSocketServer({ server })` — lobby presence, typing, broadcast,
lobby list fanout. Homepage listens as a watcher.

### Auth pattern
Every gated route: pull `Authorization: Bearer <supabase jwt>` →
`supabase.auth.getUser(token)` → 401 `{"error":"Sign in to ..."}` if bad.

### Env (all in gitignored `.env`, never commit)
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`, `PORT`,
plus optional `SMTP_HOST/PORT/USER/PASS`, `RESEND_API_KEY`, `GITHUB_CLIENT_SECRET`.
`.env.example` lists the core four. `PROJECT_MEMORY.md` indexes where secrets live
(it contains public IDs only — client ID, project ref — those are fine).

---

## 6. Database

Supabase project `opimjwmgmzwapkzgxvhk`.
Tables: `users`, `lobbies`, `messages`, `games`, `game_comments`, `servers`,
`server_members`. Trigger `on_auth_user_created` creates the profile on signup.

Migrations:
- `20260919181404_studio_files.sql` — `games.files jsonb` + storage policies
- `20260921182000_lobby_creator_set_null.sql` — FK `ON DELETE SET NULL`
- `20260923120000_studio_assets.sql` — `games.assets jsonb`
- `20260924120000_game_comments.sql` — comments table + RLS policies

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
cudic ai:  Cudic AI: Open chat
```
Note the **`glox.` prefix is intentional and kept** — command IDs and storage keys
were not renamed during the Cudic rename (only visible strings were). Same reason
the Supabase anon key storage key still says `sb-opimjwmgmzwapkzgxvhk-…`.

`glox.ts` builds a preview by **assembling project files**: inlining local CSS/JS
into the HTML, resolving `data:`/relative refs against the project map, wrapping
legacy single-file games. `assemble()` / `injectAssetUrls()` / `previewHtmlFor()`.

### Thumbnails
`games.thumbnail` (text, data-URL) — column, PUT field, and both `/api/games`
list endpoints already supported it; **only Studio lacked a control**.
`glox.setThumbnail` offers Upload / Capture-from-preview / Remove → `PUT`.
- Gallery card renders `g.thumbnail` as `<img>` (fallback: cube SVG).
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
- **Push-aside on hover**: fixed 72px spacer card, hover width **196px**,
  left 12 → right edge 208; body gets `.sb-open` → page content
  `translateX(148px)` giving a **12px gap**. Gated behind `@media (hover:hover)`
  so touch devices don't get stuck. `sb-open` toggled by listeners in `sidebar.js`.
- Rail brand `.rail-brand`: **no white chip** (user removed it — wants raw art).
  Logo fetched as inline SVG via `[data-svg]` so per-path `--d` stagger can animate:
  `railIn` (slide from C) + `railGlow` (pulse). `<img>` fallback.
- Nav items: Chat, Servers, Games, Themes (`sbItem(href,key,icon,label)`), plus
  per-lobby links and an account row → `/profile`.
- Theme pack loader lives at the end of `sidebar.js`.

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
- **`--signal #774DCB` (purple)** is the *classic app's* primary — this is a
  different context from the AI panel. **`--ember #FF8C1A`** is reserved strictly
  for live/play moments (never nav, never structure).
- Type: **Space Grotesk** headings/buttons (500/600 only), **Inter** body (400/500),
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
   checkout with `master` checked out. Real work happens in
   `C:\Users\sophi\Glox` on `fix-inline-scripts`. Pull before using it.
   It was fast-forwarded to `d3cb2dc` on 2026-09-27, so it is no longer stale.
   Because it holds `master`, **you cannot `git checkout master` in the main
   worktree** — merge there, or `git -C <OneDrive path> merge --ff-only <branch>`.
6. **Branch**: `fix-inline-scripts` (current) and `master` are both at
   `d3cb2dc`, matching `origin`. `fix-live-auth` exists. Pushing `master`
   deploys Vercel + Render.
7. **New AI provider ⇒ add its host to `AI_HOSTS`** (`server.js:726`) or the proxy
   403s. Loopback hosts are intentionally *blocked* there and called directly.
8. **`public/studio/` is gitignored** — a fresh clone has no `/studio` until
   `cd studio && npm run build` (or Vercel's `buildCommand` runs).
9. **No `&&`** — PowerShell 5.1. Use `;` and `if ($?) { }`.
10. **CSS cache** — bump `sidebar.css?v=N` on every page after editing it.
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

**Clean tree.** `fix-inline-scripts` = `master` = `origin` = `d3cb2dc`, pushed
2026-09-27. Verify with `git status` before assuming this still holds.

**Shipped in `d3cb2dc`**: marketing landing at `/` (animated: coordinate-graph
hero, marquee, feature trio, Studio/gallery/themes sections, real product
screenshots in `public/shots/`), auth screen relocated to `/login`
(`login.html` + rewrites in `server.js` and `vercel.json`), SEO foundations
(description/OG/Twitter/canonical on 9 pages + `studio/index.html`,
`robots.txt`, `sitemap.xml`, `og.png`).

**Shipped earlier**: `7de42e7` project thumbnails + full model catalogs + rail
brand animation; `17b6043` Cudic AI panel, theme packs store, sidebar
push-aside, editor context menus, gallery GSAP motion.

**Live and verified after push**: `/`, `/login`, `/games` serve the new build;
`/robots.txt` and `/sitemap.xml` return 200; Render `/api/games` healthy.

**Blocked / needs the user**: a real end-to-end AI inference call — they must
sign in, add a key, hit Test. Automated clicks can't do it without risking
their key/quota.

**Next**: the user drives landing-page design taste and wants more motion —
iterate on `public/index.html` when they give direction, then commit and push
when told.
