# Changelog

All notable changes to Cudic are documented here. Releases are versioned
(`v1.0`, `v1.1`, `v1.2`) and each entry lists what was added, changed, or
fixed. Commits are referenced by short hash.

---

## Unreleased (on `master` past `v1.2`)

**AdSense verification · gallery + type refresh · magic email codes ·
embeddable games**

### Added

**Chat history stopped disappearing** (uncommitted)
- `cleanupNonPersistent()` ran at boot +1 min and every 2h, deleting every
  message older than 2h in any lobby with `persistent = false` — which was
  **every** channel and DM, since the chat rebuild defaulted that column to
  false while its own header promised "everything persistent". History was
  being emptied on a timer. The sweeper is gone; only the moderator
  `delete_message` action removes a message now, and every existing lobby was
  backfilled to `persistent = true` (the column is vestigial).
- That same query also returned the **oldest** 100 messages (`order asc` +
  `limit 100`), so a busy room showed its first 100 for ever and never the
  recent ones. `GET /api/messages` now takes the newest 100 and flips them
  back to oldest-first for the client — matching `client.js`'s "only ever
  holds the last 100".

**Preview saves are test saves** (uncommitted)
- `CudicSave` had no host inside Studio's preview: the sandboxed frame asked its
  parent, got no answer, fell back to a local mirror a sandboxed frame isn't
  allowed, and lost everything silently. `glox.ts` now mediates
  (`registerPreviewSave`, twin of the multiplayer bridge), giving the preview
  its own storage slot — keyed by project id, working signed out, and never
  touching the cloud row a player or the author has. Testing can't overwrite
  real progress; live saves are still tested on the game page.

**In-game multiplayer** (uncommitted)
- `public/cudic-multi.js` gives a published game a room: `CudicMulti.join('code')`
  → `net.send(obj)`, `net.on('open'|'peers'|'msg'|'error')`, `net.id`, `net.leave()`.
  Same security shape as `cudic-save.js`: the sandboxed game frame holds neither
  the login token nor a socket — the host page owns one connection per game room
  and relays. Room codes are optional (`'main'` by default), so private sessions
  come for free. The Studio preview hosts rooms too now
  (`registerPreviewMulti` in `studio/src/glox.ts`), joining `<project>:preview`
  so you can test multiplayer while building, without touching the published
  game's rooms.
- `server.js` serves anonymous game rooms over the existing WebSocket
  (`multi_join` / `multi_msg` / `multi_leave`) — guests can play along, unlike chat
  which gates on sign-in. Caps: 32 per room, 8 KB per message, and **per
  connection** 20 joins/min + 200 messages/10s, with a loose per-IP backstop
  (400 joins/min, 8000 msgs/10s) so one school NAT no longer shares one budget.
  A game room never touches `lobbies`/`clients`, so chat, seats and the lobby
  list are unaffected.
- Players are named by the server: a join may carry the login token, and a
  verified one shows `users.display_name` (plus the account id, kept on the host
  page for reporting). Guests are `'Guest'`, a client-supplied name is ignored,
  and a peer id already in the room is replaced — so a name or a session cannot
  be cloned.
- "Playing now" shows up for free: `liveCount()` over the in-memory rooms rides
  on the existing `GET /api/games` and single-game responses, so gallery cards
  get an ember badge and the game page gets a live pill that switches to the
  exact per-room peer list once the game joins. No polling, no new endpoint.
- Game chat is unreviewable after the fact (nothing is stored), so the game
  page's "playing now" strip reports a **player's account** through the existing
  report modal (`window.CudicReport.open`), with copy that asks for the details
  because the note is the only evidence a moderator gets. Guests have no account
  to report.
- Outside any host page (a local .html file, plain embed, `play.html`) there is
  nothing to relay through, so `join()` reports an error instead of going quiet —
  the host handshake is page-local, not a network timeout.
- Found while wiring the above: `view.html` sent cloud saves as
  `Bearer undefined` (a Supabase session has `access_token`, not `token`), so
  signed-in cloud saves silently never reached the server.

**Studio: guest guide + restore points** (uncommitted)
- Signed-out builders are told once, on Studio boot, that the project lives in
  this browser only — with "Export .zip" and "Sign in" buttons. The
  save-when-signed-out warning offers the same two exits instead of a dead end.
  New command `glox.restoreSnapshot` (palette + File menu) picks from a ring of
  10 restore points per project, most recent minute-by-minute, and reloads into
  the chosen one; the state left behind stays selectable.

**Multi-file ES modules in previews *and* published games** (uncommitted)
- A relative `import './x.js'` between project files is rewritten to an
  import-map id (`cudic~<path>`) targeting a `data:` URL of that file, gathered
  transitively including cycles — same algorithm in `studio/src/npmutil.ts`
  (preview) and `public/run.html` (player), so a published game matches what
  you tested. Merged into the project's own `<script type="importmap">` when
  present. Legacy single-file projects take the byte-identical old path.
- Limits: CSS `@import './y.css'` between files, and paths built in JS
  (`new URL('./a.png', import.meta.url)`); JSON imports need `with { type: 'json' }`.

**Game reporting** (plan.md 2.1, first slice — uncommitted)
- `POST /api/reports` accepts `content_type: 'game'`: published games by
  id (owners may also flag their own draft), same 5 reason values as packs,
  so both land in one review queue. Pack flow untouched, no migration.
- New `report-button` React island on game pages: Report button + modal
  (reason select, details, sign-in prompt for guests), revealed after the
  game loads. Sweep/send-state styling adapted from the `cudic-test`
  button library (`ShineButton`/`LoadingButton`) in `.isl-` CSS.
  Islands rebuilt, `games.html` + `view.html` pinned at `?v=5`.
- v1 omits evidence upload for game reports; `/themes` keeps picture upload.

**Message/user reporting + moderation queue** (plan.md 2.1–2.2 — uncommitted)
- `POST /api/reports` accepts `message` (reporter must see the room) and
  `user` (no self-reports); 20/hour rate limit. Chat gains a hover Flag
  button on others' messages with a message/sender report modal. Message
  ids flow via history select + a `message_saved` WS patch keyed by client
  `cid`, so broadcast latency is unchanged. `client.js` → `?v=6`.
- New mod-only endpoints (allowlist in `moderators` table):
  `GET /api/reports/mine`, `GET /api/reports/queue` (status/type filters,
  content previews), `POST /api/reports/:id/action` (dismiss, reviewing,
  actioned, unpublish game/pack, delete message — all audited in
  `moderation_actions`). Minimal `/moderate` page for the queue.
- Requires running `supabase/migrations/20261014120000_moderation.sql`
  and inserting your auth UUID into `moderators`; pre-migration the queue
  safely 403s. `docs.html` reports section updated.

**Music cloud tracks + unified Your Projects** (uncommitted)
- New `music_tracks` table + `/api/music` CRUD: signed-in users sync
  tracks to their account (debounced, localStorage mirror), guests stay
  local. Track title/picker/New/Delete/sync status in the Lab topbar,
  `?track=` deep links, track switching via reload.
- Your Projects tab now lists Studio projects, unpublished theme drafts
  (with `/themes?edit=` deep link into the builder), and music tracks.
- Pack rows grew up: all own packs listed under Theme packs with
  Published/Draft badges plus Edit, Publish/Unpublish, and Delete —
  same actions as Studio project cards.
- Button effects pass (ported library LiquidFillButton/ShineButton, no
  Tailwind on classic pages): danger-red liquid fill from the cursor on
  the Report island button, theme Delete buttons, and Studio card
  Delete/Unpublish; shine sweep on gallery Play buttons. Islands at `?v=6`.

**Cloud-save load race fix** (uncommitted)
- Fresh page loads raced the cloud-save fetch: the game asked before the
  parent had an answer, concluded "no save", and bests read 0. The parent
  now reports `loading` while fetching (8s safety cap) and the save
  library re-asks instead of giving up. (`view.html` mediator +
  `cudic-save.js`; embed's local-only path untouched and compatible.)

**Loading rings removed** (uncommitted)
- The shared page-loading veil and the player % gauge are gone again —
  pages are back to skeletons plus the plain "Loading…" player overlay.
  (`pring.css`/`pring.js` deleted, all hooks reverted.)

**GitHub-login double fix** (uncommitted)
- Fresh OAuth logins minted a seat then heartbeated instead of claiming,
  403ing as a phantom "signed in on another device" whenever any other
  live seat existed. `bootSeat(true)` now claims. (`auth.js`)
- Raw `atob()` on base64url JWT payloads throws on `-`/`_`, silently
  leaving signed-in users (GitHub metadata hits this ~1 in 14 tokens)
  showing as Guest. Sidebar rail and classic editor now decode
  base64url-safe. (`sidebar.js` → `?v=13` everywhere.)

**Email-only signup + password reset** (uncommitted)
- Signup asks for email only; a random placeholder holds the account
  until the wizard sets the real password. New "Forgot password?" flow
  (code + new password, `POST /api/auth/reset-password`) doubles as the
  rescue for closed tabs — it also confirms the email. No migration.
- Wizard password step keeps trimmed compare (no more phantom
  mismatches) and a plain-English same-as-current error.
- Every auth await (verify, reset, sign-in, session, code send) now races
  a 15–30s timeout: a dropped connection (e.g. a deploy restart mid-click)
  surfaces "taking too long — try again" instead of spinning forever.
- Verify/reset/profile fetches retry once on dropped connections, and the
  login + welcome pages pre-warm the sleeping host on load — the timeouts
  above are now a backstop that should never fire, not the fix.

**True deferred registration** (uncommitted)
- `POST /api/auth/confirm-signup` creates the auth row (pre-confirmed)
  only after the code proves the inbox — signup itself only sends mail,
  so nobody is ever registered without verifying. Returning logins keep
  the classic verify path; double submits return exists-and-sign-in.
  Verified end-to-end locally (wrong code/short pw/good code, row burn,
  profile trigger, cleanup).
- Fixed the wizard Finish "Nothing to update": the PUT handler read
  `setup_done` off the raw body string instead of the parsed JSON.
- Fixed the endless "Confirm email" spinner: `run()` set a "loading" status
  and never cleared it, so the code screen (reached from inside signup, or
  sign-in when verification is pending) rendered its button permanently
  `disabled` with a spinner — the click never even fired. Success paths now
  release the status unless they already moved it to "ok". This was the real
  cause of the "button circles forever" reports, not the deploy restarts.
- Login + welcome now follow `config.js`'s rule: on localhost they call the
  local backend, elsewhere Render. They previously hardcoded Render, so any
  brand-new endpoint 404'd (no CORS → "Failed to fetch") when testing locally.
  Full flow verified locally end-to-end: signup → code → account created →
  wizard (username/password/style) → chat, `setup_done` flipped true.

**Welcome wizard + delete-my-account** (uncommitted)
- New `/welcome` setup wizard (`cudic-test`, re-exported): Username for
  everyone, Password for email accounts, Style accent pick — non-skippable
  pages, no back doors in the UI. Display-name field removed from signup.
  Entry fenced at login boot, post-auth routing, and classic chat OAuth
  return (explicit `setup_done === false` only, so old rows and missing
  profiles fall through to chat).
- `users.setup_done` (migration `20261015120000_profile_setup.sql`,
  grandfathered true; new signups false), surfaced in GET /api/profile
  and flippable once via PUT.
- Profile Security gains Delete my account: leaving message, type-the-
  shown-code, press-and-hold confirm. `DELETE /api/account` (seat-checked)
  best-effort purges storage then deletes the auth user (rows cascade,
  same path as the purge). No captcha provider: the code + hold *is* the
  bot gate; Turnstile stays a follow-up needing Cloudflare keys.

**Creator avatars in gallery + game pages** (uncommitted)
- The games list and single-game endpoints now select the owner's
  `avatar_url`; cards and the game page show the picture with an initial
  fallback. (Cards showed initials because the API never asked for it.)

**Back navigation on railless pages** (uncommitted)
- Terms, Privacy, and Guide pages (all `data-no-rail`) gain a ← Back
  button (history-aware, falls back to home) plus a Cudic home link.

**Terms page + profile nav and analytics** (uncommitted)
- New long-form `/terms` page (routes in `server.js` + `vercel.json`,
  sitemap entry). Profile sticky nav gains an Analytics section (creator
  stat tiles + top games via `/api/creator/stats`) and a Site group
  linking Privacy, Guide, and Terms.

**Profile page rebuild** (uncommitted)
- Docs-style three-column layout: sticky tab nav (Profile, Security,
  Coins, Analytics, Liked, Appearance) showing one section at a time with
  the live "What others see" preview always visible, plus a Site group
  (Privacy, Guide, Terms). Email confirmation moved under Security; all
  existing IDs and flows untouched.

**Login spotlight fix** (uncommitted, `cudic-test` + re-export)
- The form card's MagicCard spotlight was permanently painted (inline
  opacity beat the hover gating) in dark `#262626` — invisible on dark,
  a dirty smudge on light. It now appears only on hover and follows the
  theme (graphite on dark, soft signal-tint on light). Rebuilt export
  copied to `public/` (`login.html`, `index.html`, `_next`).
- Follow-up: dark spotlight softened (0.45 opacity, 180px radius) after
  it read too intense on hover.

**Creator dashboard v1** (uncommitted, backend + Your Projects)
- `GET /api/creator/stats`: per-game plays/likes/comments/forks,
  per-pack downloads/sales/revenue, balance + receipts, open reports.
- Creator overview section with stat tiles and top-5 games. No migration.
- Requires running `supabase/migrations/20261014130000_music_tracks.sql`;
  pre-migration the music section stays empty without errors.

**Coin anti-abuse caps** (plan.md 2.3 — uncommitted, backend only)
- Ledger-read daily spend (1000), seller daily earnings (10000), and
  purchase velocity (10/hour) caps on pack buys, each a 429 with a plain
  message. Free/repeat buys exempt. No migration; tipping/paid-game rules
  arrive with those features.

**Google AdSense verification** (`f1bc10d`, `fb142d3`)
- Account-level `adsbygoogle.js` snippet site-wide (static heads + sidebar
  injection), `ads.txt` with the publisher ID, `/privacy` page + routes,
  ownership `<meta>` tag. Site verified; review requested with all
  sensitive categories blocked. Adsterra slots paused meanwhile.

**Magic email codes** (`15327eb`, migration `20261011120000_email_codes.sql`)
- 6-digit codes over our own mail stack replace the magic-link flow
  (in-memory tokens retired): `POST /auth/send-code` (hashed, 10-minute
  expiry, Resend → SMTP fallback, rate-limited) + `POST /auth/verify-code`
  (constant-time compare, 5 attempts then burn, flips `email_confirm`).
- Soft enforcement via `needVerified()`: publish/unpublish/delete games,
  comments, packs, reports, server create, and WS join/send 403 with
  `email_unconfirmed` for unconfirmed email signups. GitHub OAuth and
  pre-existing accounts exempt. Reads, playing, browsing stay open.
- Login card flips to a code screen after signup (resend + cooldown);
  profile gains a verify card for anyone who closes the tab mid-flow.
- Hard gate, total coverage: login + chat boot bounce unconfirmed accounts
  to the code screen (`GET /auth/verification-required`); **every**
  authenticated write (likes, DMs, friends, quests/coins, packs, saves,
  servers, channels, AI proxy, forks, imports) 403s `email_unconfirmed`
  via `needVerified()` — reads, play counts, and the session machinery
  stay open. A daily sweep deletes email accounts still unconfirmed after
  24h (GitHub + pre-code accounts exempt; everything cascades).
- Mail goes HTTPS-only: Gmail API first (own Gmail account, `gmail.send`
  scope, `GMAIL_*` env — no domain, phone, or card), Resend SDK second,
  Brevo API third (coded but unconfigured — its phone/address verification
  is a non-starter). Render's free tier seals outbound SMTP ports, so
  nodemailer's SMTP path was deleted.

**Embeddable games** (`embed.html`, `/embed` route)
- Chromeless player: cover (thumbnail/title/author + ember play button),
  sandboxed `run.html` boot on click, local-only saves (no sign-in nudge
  inside other sites' pages), one honest play-count per click, "Play on Cudic"
  return link. Unpublished games get a notice, never the player.
- `/embed.html` exempted from `X-Frame-Options` (everything else keeps
  `SAMEORIGIN`); `/embed` rewrites in `vercel.json` + `server.js`.
- Share modal on game pages: link row + fixed `485×402` and responsive
  `100%×400` iframe snippets with copy buttons; drafts see link-only.

**Gallery + type refresh** (`9c44757`)
- Tag chips removed everywhere (gallery toolbar, game page); toolbar
  rebuilt as one row (title removed, search grows, sort pinned).
- Satoshi body + Epilogue headings (theme-pack lists, engine map, server
  allowlist, and design docs updated to match).
- Global squircle corners (`corner-shape: squircle`, circles exempt).
- Docs remade as reference layout (section nav, breadcrumb, sub-TOC,
  hash routing); docs + privacy pages drop the rail (`data-no-rail`).
- Single-seat sessions: pages claim only when minting fresh, normal loads
  heartbeat (no more phantom "other instance" kicks); second tabs stand
  down silently with no banner.

**Next.js landing page** (built in `cudic-test`, shipped as static files)
- `/` replaced with the new landing: kinetic title, dock nav with hover
  labels, flying-in sections, tilt cards, magnetic buttons, and a fixed 3D
  backdrop streaming 7 Kenney CC0 models from the asset library.
- Static export (`out/`) copied to `public/` (`index.html`, `_next/`,
  `models/`); old page kept unrouted at `index-legacy.html`. No server,
  API, or other-page changes; immutable cache on `/_next/static/*` and
  `/models/*`, `index.html` stays no-store.
- Theme toggle reads/writes the site's own `glox_theme` preference
  (dark default) so packs and other pages keep working.
- Cookie consent: bottom banner (Reject / Choose / Accept) + full settings
  modal (Essential locked, Preferences, Advertising), choice in a
  `cudic_consent` cookie; AdSense script loads only after advertising
  consent; footer gains a Cookie settings link.

**Next.js login page** (same `cudic-test` static-export pipeline)
- `/` login replaced with a Magic UI + Canvas UI build: particle Kenney
  model stage (push-around particles, 7s rotation), meteor/particle
  backdrop, MagicCard spotlight form, shimmer submit, animated
  sign-in/create tabs, shake-on-error, confetti success burst.
- Real auth, not the demo: same Supabase project (sessions carry over),
  Render API for codes, hard email gate (unconfirmed lands on a matching
  6-box code screen with resend cooldown), GitHub OAuth → `/chat`,
  guest → `/chat`. Old page kept unrouted at `login-legacy.html`.

### Fixed

- `GET /api/games/liked` always 404'd — the route sat below the generic
  `/api/games/:id` handler, which swallowed it. Moved above; profile liked
  games list works again.
- Malformed `?token=` values no longer burn Supabase lookups (JWT shape
  check client + server; instant 401).
- Gallery script killed by a dangling `async` after the tag-listener
  removal — grid loads again.
- Embed cover bugs found in testing: gradient overlay swallowing Play
  clicks (`pointer-events: none`) and `display:flex` overriding `hidden`.

### Changed

- `sidebar.js` → v11, `sidebar.css` → v23, `theme-engine.js` → `?v=1`.
- Rail icons render at full `--text-primary` for contrast.
- `privacy.html` pins `sidebar.js?v=11` (was v8); sitemap gains `/login`
  and `/privacy`; endpoint docs drop the deleted `/auth/verify`,
  `/api/lobby` and `/api/lobby/persistent` routes.
- Rail brand is the raw C mark (no wordmark, no chip), linking `/` for
  guests and `/games` for signed-in users; `sidebar.css` → v24,
  `sidebar.js` → v12.

---

## v1.2 — 2026-10-09

**Studio file viewers · IndexedDB auto-save · searchable Kenney library**

The biggest release yet. Studio grows a real file-viewer pane (3D models,
PowerPoint, spreadsheets, zip), a browser-database auto-save so a frozen tab
no longer loses work, and a searchable Kenney asset library spanning 48,192
images and 4,812 3D models. Also lands the Glox → Cudic rename, the Cudic AI
panel, theme packs, Studio on Vercel, cloud saves, single-seat sessions,
virtual coins, a chat rebuild, and the Music Lab.

### Added

**Studio file viewers** (`studio/src/glox.ts`)
- `.glb` 3D model viewer — three.js `GLTFLoader`, camera auto-fit, grid,
  spin + wireframe toggles. Resolves Kenney's external textures (e.g.
  `Textures/colormap.png`) via the `parse()` base path, since a bare `blob:`
  URL cannot resolve relative texture URIs.
- `.pptx` viewer — `@aiden0z/pptx-renderer` (DOM rendering, selectable text,
  `RECOMMENDED_ZIP_LIMITS` guard for untrusted files).
- `.xlsx` / `.xls` viewer — SheetJS with clickable sheet tabs.
- `.zip` viewer — JSZip entry listing.
- `mimeOf()` returns real office types (docx/pptx/xlsx/xls) so published games
  serve and download them correctly.

**IndexedDB auto-save safety net** (`studio/src/project.ts`, `main.ts`)
- Snapshots the live editor state to IndexedDB every 15s, plus on tab-hide
  (`visibilitychange`) and tab-close (`beforeunload`).
- Restores on boot, so a frozen tab does not cost unsaved work.
- Clears on save/publish so a stale local copy cannot clobber a newer
  published version.
- Binary-safe: `Uint8Array` survives via structured clone (localStorage
  cannot hold assets). Unsaved text is read from the live Monaco models
  (`vscode.workspace.textDocuments`) overlaid on the provider's files.

**Searchable Kenney library** (`studio/src/kenney.ts`)
- Searchable picker over 48,192 images + 4,812 `.glb` models, fetched at
  runtime from the upstream repo — never committed to this codebase.
- Images insert an `<img>` at the cursor; `.glb` models land as project
  files.
- Pinned upstream tree SHA for the 3d index; images track the branch.

**Studio on Vercel** — build Studio on Vercel and serve `/studio`; binary
assets end-to-end with a `games/mine` endpoint and a Your Projects tab.

**Preview assembly** — project-aware preview assembly that inlines local
css/js, a native icon preview toolbar, canvas-bitmap thumbnail capture, and
canonical URLs switched to `cudic.vercel.app`.

**Cloud saves & sessions** — account-bound cloud game saves, single-seat
sessions (one live seat per account), X-Seat through CORS preflight.

**Cudic AI panel** — the Cudic AI panel in the workbench, premade AI skills,
project file tools, and a terminal AI panel with runtimes, pack builder,
seed games, and legacy scene conversion.

**Theme packs** — community theme packs with a builder and store, pack
reports, and a coins ledger + schema.

**Chat rebuild** — chat rebuilt on servers, channels, DMs, and friends;
lobbies removed; strict sign-in.

**Gallery** — findable gallery with tags, trending, likes, and play counts;
catalog heroes with sort; gallery cards; denser sidebars; a share loop with
share button and thumbnail endpoint.

**Sidebar & theme** — dark mode by default, collapsed rail with tooltips,
page panels, Web Awesome loader.

**Music Lab** — Music Lab at `/music`, plus accent persistence across
navigation and a custom accent color.

**Landing & auth** — marketing landing page, `/login` split, SEO foundations,
rebuilt login page with Fredoka/Nunito fonts, Baloo 2 rail wordmark, an
email-verification system (Resend + Supabase confirm, Gmail/SMTP/Supabase
fallbacks), and a user-ID system with publish modal.

**Scratch import** — import Scratch projects (`.sb3` or shared link) into
Studio.

**Kenney icon library** — Kenney CC0 icon library with a Studio insert
command (later superseded by the searchable library above).

**Seed games** — chess and tic-tac-toe seed games with a Stockfish service
(chess later archived).

**Docs** — docs page, `product.md`, refreshed `AGENTS.md`.

### Changed

- Renamed product **Glox → Cudic** (visible strings only; command IDs and
  storage keys unchanged).
- Cache-busted game loads; Studio/editor read the API base correctly on
  production; theme packs moved to `/packs` so `/themes` serves the store.

### Fixed

- `document.write` player, version handshake, cache discipline, asset-only
  guard; XML-invalid comments stripped from thumbnail capture; editor content
  no longer hidden behind the sidebar; OAuth callback flows finished; broken
  fluid.js/gsap references stripped; inline-script comments converted so
  pages parse; Supabase loader made a singleton.

### Commit log (v1.1 → v1.2)

- `8ad08f2` feat: Studio file viewers, IndexedDB auto-save, searchable Kenney library
- `3a5ccd4` chore: archive chess, remove from the main site
- `f36546f` fix: download Stockfish instead of apt, which cannot run on Render
- `1b7f777` feat: chess and tic-tac-toe seed games, Stockfish service
- `351ec10` feat: Kenney CC0 icon library with a Studio insert command
- `f844f15` fix: allow X-Seat through CORS preflight
- `300cfda` style: flatten tag filters and likes into text, not pills
- `a3767ca` feat: findable gallery with tags, trending, likes and play counts
- `b62ff27` feat: docs page, plus quest claim button fix
- `723453d` feat: import Scratch projects into Studio
- `a88f2f0` feat: minimal Baloo OG images plus transitive remix credit
- `aadd145` fix: Studio and editor read API base correctly on production
- `8e659f3` fix: cache-busted game loads plus button base classes
- `c7d8bd3` feat: unremovable remix credit plus single-game embed fix
- `70cda2c` feat: account-bound cloud game saves
- `8eba9c9` feat: single-seat sessions plus Duo-style seed games
- `37be268` chore: ignore local-only noise
- `8f9a871` feat: terminal AI panel in bottom bar, runtimes, pack builder, seed games, legacy scene conversion
- `ec81886` feat: virtual coins, community theme packs with builder and store, pack reports
- `d84b95c` feat: coins ledger plus theme-pack and report schema
- `a272fa1` feat: catalog heroes with sort, gallery cards, denser sidebars, custom accent picker
- `2d0b86d` feat: dark mode by default, collapsed rail with tooltips, page panels, Web Awesome loader
- `923a7c0` feat: rebuild chat on servers, channels, DMs and friends; remove lobbies; strict sign-in
- `e8d147b` docs: add product.md; update AGENTS.md
- `4c0128d` feat: Music Lab at /music; fix accent persistence
- `5958aa9` feat: rebuild login page, Fredoka/Nunito landing fonts, Baloo 2 rail wordmark
- `7a74296` feat: premade AI skills and project file tools in Cudic panel
- `d9492bd` fix: strip XML-invalid comments in thumbnail capture; switch canonical URLs
- `c6a2d3c` fix: refresh session for Your Projects tab; capture canvas bitmaps
- `5842287` feat: redesign landing page as light editorial layout
- `b7363c6` chore: refresh /studio screenshots
- `2949f79` fix: move theme packs to /packs
- `52fd7c5` add share loop: share button, thumbnail endpoint
- `06c86dd` docs: refresh AGENTS.md
- `d3cb2dc` feat: marketing landing page, /login split, SEO foundations
- `7de42e7` feat: project thumbnails, full model catalogs, rail brand animation
- `17b6043` feat: Cudic AI panel, theme packs store, sidebar push-aside, editor context menus, gallery motion
- `5add766` feat: rename product Glox to Cudic
- `ef7c1a5` fix: document.write player, version handshake, cache discipline
- `cde9d8c` feat: per-game comments + publish toggle
- `d90d474` feat: native icon preview toolbar, project-aware preview assembly
- `6c933f0` fix: preview assembly inlines local css/js
- `500c479` feat: build Studio on Vercel, serve /studio
- `0adf1de` fix: gallery Your Projects accepts ?token= URL sessions
- `bbe3be9` feat: studio binary assets end-to-end, games/mine endpoint
- `c690040` feat: owner-only editing
- `fe9f27c` fix: bake game id into card click handler
- `3fb83a0` fix: studio reads login session
- `32fdc2f` feat: studio run/import/markdown fixes, XSS + rate-limit hardening
- `e0520fa` fix: getSupabase always returns promise
- `df98e6c` fix: serve email from profile API
- `800bcf7` feat: generic SMTP fallback
- `77a4ce1` feat: Gmail SMTP fallback
- `76e24c2` feat: Supabase-native verification fallback
- `04cae32` fix: single client-first auth token source
- `bf7a8a4` fix: OAuth failure diagnostics toast
- `dfc4967` fix: handle both OAuth callback flows
- `61468c5` fix: finish GitHub OAuth
- `9ba802c` feat: studio IDE, profile page, auth routing cleanup
- `1d92b7c` Merge branch 'fix-inline-scripts'
- `e35dfd8` feat: Scratch-inspired palette, local route parity
- `af0e112` Merge branch 'fix-inline-scripts'
- `fc38bc9` feat: light-only sunny theme, single-card sidebar
- `3f6c004` chore: redact secrets into gitignored .env
- `90e28fe` chore: redact secrets into gitignored .env
- `c8fb2c7` one line 7.7kb fix
- `7f39547` fix: convert // comments to block comments in minified inline scripts
- `fc1bccb` fix: make Supabase loader singleton + error handling
- `b4b5ad9` fix: strip broken fluid.js/gsap references

---

## v1.1 — 2026-09-18

**Stable Split Sidebar**

A 57-commit push focused on the sidebar, chat, and publishing. The sidebar was
reworked into a split, theme-proof design; chat grew servers, group chats, and
history persistence; a user-ID system and publish modal landed; and the UI was
rebuilt per `design.md` with fluid GSAP motion.

### Added

- Split sidebar into two cards with a gap and rounded corners; top brand as a
  single theme-proof SVG.
- Chat rebuilt on servers — user-owned group chats (max 3), visibility,
  invites, a server page, and a sidebar.
- Chat history persistence (creator toggles persistent vs 24h auto-delete).
- User-ID system (unique numeric ID per user, editable display name, profile
  API).
- Publish modal with thumbnail, description, and credits; gallery shows
  thumbnails.
- Fluid GSAP animations — stagger, hover, sidebar expand, modals, chat.
- Full UI redesign per `design.md` — color tokens, Space Grotesk/Inter fonts,
  signal accent, SVG icons, two-panel auth, empty states, light mode.
- Google site-verification files.
- Nine Circles font for logo branding.

### Changed

- Sidebar made fixed-position overlay; content fills full width; labels hide
  cleanly when collapsed; icons center; widened to 72px.
- Home shows a lobby picker instead of auto-joining Welcome; logged-in users
  auto-join Welcome.
- Public servers join without a code (owner-only persists); guest messages can
  save (nullable user_id); welcome/hello persist by default.

### Fixed

- Brand always visible and high-contrast; GSAP fluid overlays removed; logo
  reverted to clear Space Grotesk; chat font/contrast; server lobbies hidden
  from Active; WebSocket closes on page leave (ghost lobbies); sidebar nav
  preserves URL params; content fills width; both PKCE and implicit OAuth
  flows; stale-CSS cache busts.

### Commit log (v1.0 → v1.1)

- `601791a` feat: split sidebar into 2 cards with gap + rounded corners
- `c4ba9d6` fix: force brand always visible, cache bust v5
- `ed9eef4` fix: brand shows on hover, stays solid white
- `beed8be` fix: force brand visible solid white, cache bust v4
- `6db5659` fix: remove all GSAP fluid overlays and effects
- `b40800a` fix: strip overlays - solid white logo
- `762ef7d` fix: keep brand visible when collapsed, boost contrast
- `88dd964` fix: make brand high-contrast white with black outline
- `fd93695` fix: logo back to clear Space Grotesk
- `f5ad57b` fix: revert headings to Space Grotesk
- `cf4a5f7` feat: logo always white with dark outline
- `ee01e3e` feat: stretch brand area
- `a2e41d7` fix: chat without lobby redirects; add Nine Circles font
- `f58d668` feat: dedicated lobbies panel
- `1b8e92d` fix: cube logo stroke visible when collapsed
- `ee5949b` fix: light mode text contrast, sidebar spacing
- `7cdba98` fix: clearer chat font
- `29a3b26` fix: hide server lobbies from Active; ws closes on page leave
- `aca139b` feat: google verification html file
- `bce3378` feat: google site verification meta tag
- `9f738ea` feat: fluid GSAP animations
- `a355f7b` feat: collapsed Your servers label becomes a divider
- `94f1e47` fix: prevent squish - hide collapsed labels
- `b3f3dd3` fix: remove Home/Editor from sidebar
- `2e3f3ed` fix: keep avatar + servers visible when collapsed
- `73e536c` fix: hide collapsed label so icon centers
- `0fe4972` fix: ensure icons perfectly centered when collapsed
- `93a814d` fix: center icons when collapsed
- `5661bd2` fix: widen collapsed sidebar 60->72px
- `408d591` fix: sidebar auto hover expand, public servers show
- `0e0e4ed` fix: public servers join without code, persist for owners
- `8ff937d` fix: persist welcome/hello by default
- `136f790` feat: servers - user-owned group chats, invites, server page
- `85f2411` feat: chat history persistence
- `ecd42ae` feat: game cards show creator name, avatar, user ID
- `8bcdabf` fix: modal buttons use addEventListener
- `c63542f` fix: Save = quick save, Publish = modal
- `276133a` feat: publish modal with thumbnail, description, credits
- `fd56836` feat: user ID system
- `84b4e62` fix: home shows lobby picker, add logout button
- `702d9ff` chore: cache bust CSS
- `e002964` fix: handle both PKCE and implicit OAuth flows
- `cdb866e` fix: cache bust stale CSS
- `2b17338` fix: editor content hidden behind sidebar
- `5941487` fix: sidebar nav preserves URL params
- `f044169` fix: chat/games fill full width
- `24f5825` feat: logged-in users auto-join Welcome lobby
- `f5cf26a` feat: full UI redesign per design.md
- `630d2b9` fix: sidebar is now fixed-position overlay
- `38b1169` fix: content fills full width
- `0d2a388` fix: sidebar layout - body is flex row
- `b491bdc` fix: hide chat sidebar by default
- `3ea3a58` feat: sidebar navigation + redesign all pages
- `2f3b953` fix: pass access_token from OAuth callback
- `1697c1d` refactor: remove Scripts/Material tabs
- `16c6178` feat: packages system - built-in materials, shaders, scripts
- `b9b6faa` feat: split panel layout system with draggable splitters

---

## v1.0 — 2026-09-16

**Full Editor (pre-panel refactor)**

The initial 40-commit release. Ships the Glox real-time chat product and a
Unity-style game editor with a Three.js 3D viewport, hierarchy, properties,
materials, scripting, save/publish, and a gallery. Auth is Supabase OAuth
with email verification.

### Added

- Initial product: Glox real-time chat lobbies (Vercel/Render split).
- Game editor — Three.js 3D viewport, hierarchy, properties panel, save/publish.
- Material system (Standard/Phong/Lambert/Toon/Custom Shader).
- Right-click context menus everywhere (hierarchy, viewport, file explorer);
  folders in the file tree.
- Undo/redo, file explorer, script attach/delete, console.
- Camera system — Directional/Spot/Ambient/Hemisphere lights,
  Gradient/Starfield/Solid skyboxes, camera preview, frustum visualization,
  play mode locked to scene camera, camera Attach-To dropdown.
- Sandboxed play mode with a `document.write` player and version handshake.
- Gallery page + nav tabs; games table schema + CRUD API.
- Sidebar navigation across all pages; dark/light mode toggle; lobby picker.
- Email verification (Resend + Supabase confirm); Supabase OAuth; persistent
  messages and message history; WebSocket heartbeat.

### Fixed

- Play-mode race condition; iframe srcdoc ordering; transform helper crash;
  inline `onclick` replaced with `addEventListener`; viewport sizing with
  ResizeObserver; context-menu stopPropagation; lobby user dedup; token=
  undefined in URL; CORS headers for verification email.

### Commit log (root → v1.0)

- `54cf2b7` release: pre-panel-refactor snapshot (v1.0)
- `b683e54` feat: play mode locked to scene camera
- `7cd0c3b` fix: clear iframe srcdoc before setting src
- `d68c0d6` fix: play mode race condition
- `6999616` feat: camera frustum visualization, camera preview
- `b1fd696` feat: lights, skyboxes, context menu, file tree
- `974e25d` fix: stopPropagation on contextmenu handlers
- `801701c` fix: restore .panel-tabs CSS
- `92ff35d` feat: right-click context menus, folders
- `aed2a76` feat: undo/redo, file explorer, material system
- `fc465af` fix: remove transform.getHelper() crash
- `6a2de4c` fix: buttons wired via addEventListener
- `5848509` feat: Unity-style editor — Monaco scripting, sandboxed play
- `0a1f26a` fix: brighter scene, visible grid, ground plane
- `e88b45d` feat: Game Editor + Gallery buttons to chat sidebar
- `85bd4c3` fix: add /games and /editor routes to vercel.json
- `37cdb37` feat: game editor + gallery page + nav tabs
- `81313b8` feat: games table schema + CRUD API
- `bdaa83d` fix: deduplicate lobby users + token=undefined
- `818f43e` fix: WebSocket heartbeat to kill ghost lobby connections
- `611b7f7` fix: re-check verification status when tab regains focus
- `7275134` fix: add CORS headers for verification email
- `f170283` fix: make Resend email failure non-blocking
- `21408cb` feat: email verification system
- `25297fd` feat: add 3D canvas background to chat page
- `a06f289` fix: lock card center with position fixed
- `0be681f` Remove tagline, keep panel centered
- `7924e58` Pixel art canvas UI with new color palette
- `454b8ef` Fix lobby count not updating on homepage
- `4409185` Show account created then auto-login after signup
- `36a9b13` Fix WS_URL, OAuth callback, client-side code exchange
- `52c7218` Restyle to clean zinc + blue palette, drop purple slop
- `a7e98ef` Merge login + lobby into single split-layout page
- `937ec13` Redesign login page with split layout and dark theme
- `b7899ae` Add rewrites for login and index pages
- `dd7a3a6` Add real Supabase credentials
- `ad64d03` Add Supabase: OAuth, persistent messages, message history
- `6f29bbc` Set WS_URL to Render backend
- `5cbd8c5` Add Vercel/Render split deployment configs
- `4d06379` Initial commit: Glox real-time chat lobbies
