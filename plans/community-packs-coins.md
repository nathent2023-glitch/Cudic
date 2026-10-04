# PLAN: Community theme packs + coins purchase loop + reports

## 1. Goal
Let users create, publish, sell, buy, and install theme packs; creators earn 100% of each sale in virtual coins; reports with reason + optional picture go to manual review. Unblocks the "public community + money system" direction.

## 2. Locked decisions (user)
- Prices now; owner sets price; buyer pays, **creator gets 100%** (no platform cut — revisit if a treasury is ever needed).
- Instant publishing + reports; owner reviews manually. Report = required reason (preset list) + optional details + optional picture evidence.
- Coins are virtual-only (real-money/crypto explicitly deferred to a later legal/tax/KYC project).
- No lootboxes/gacha/fake scarcity (declined; desirable-but-honest sinks only).
- Follow-ups parked, not in this build: pack revenue beyond 100%, hosted-pack DRM (static files can't be gated — API serving is the enforcement point), wordmark upload, video backgrounds, admin dashboard (manual SQL for now).

## 3. Architecture (fits existing engine — no engine rewrite)
- `theme-engine.js` already treats manifests as untrusted data (allowlisted fonts, scene-by-id gating, no code in packs). Reuse as-is.
- Install stays `localStorage`-based (`installPack(slug, manifest)` already accepts any manifest object).
- Enforcement point = `GET /api/packs/:id/manifest` (server says no unless free/owned/owner). Static built-in pack untouched.
- Coins: `users.balance` + append-only `coin_ledger` + atomic `grant_coins`/`spend_coins` RPCs (`security definer`); server calls via `supabase.rpc`.

## 4. Schema (ONE migration file)
- `users.balance integer not null default 0`
- `coin_ledger(id, user_id→users, delta int, reason text, ref_id uuid null, created_at)` + index on `(user_id, created_at)`
- `grant_coins(p_user, p_delta, p_reason, p_ref)` / `spend_coins(...)` (spend raises on insufficient funds); RLS: users SELECT own ledger only; writes service-role only
- `theme_packs(id uuid pk, slug text unique, owner_id→users cascade, name, description, manifest jsonb, price int default 0, downloads int default 0, featured bool default false, published bool default false, created_at, updated_at)`
- `pack_ownership(user_id, pack_id→theme_packs cascade, pk(user_id, pack_id))`
- `reports(id, reporter_id→users, content_type text ('pack' now; 'game','message','user' later), content_id uuid, reason text required, details text, evidence_url, status text default 'open', created_at)`; RLS: insert own, select own
- Storage: `pack-assets` bucket (public read / auth upload / owner manage — same policy shape as `avatars`); `report-evidence` bucket (private: auth insert, owner-only select; admin reviews via service role)
- RLS on theme_packs: anyone reads `published=true`; owners full rights on own rows (select/update/delete where owner_id = auth.uid())

## 5. Server validation (manifest — never trust the client)
Allowlisted top-level keys only. `colors.*` must match `^#[0-9a-fA-F]{6}$`. `fonts.head/body` must be in engine FONTS list. `background.type` in {none, scene, image}; scene id must exist in SCENES; image src must be https (same-supabase-host preferred). `radius` 0–24 int. `tags` max ~8 short strings. `name` 2–40 chars, `description` ≤500. `price` int 0–100000. Slug server-generated (`name-slug + short id`, retry on conflict); built-in slugs (`anime-city-night`, etc.) reserved. Reject anything else.

## 6. API endpoints (all auth-required unless noted)
- `GET /api/coins` → balance + recent receipts
- Quest defs server-side (`QUESTS` map: publish_first 100, first_dm 25, profile_complete 25, join_first_server 25, first_friend 25); `GET /api/quests` (list + done state from ledger); `POST /api/quests/claim {quest}` (once-only via ledger check); `POST /api/daily/claim` (10, once per UTC day from ledger); activity trickle (first 10 msgs/day = 1 coin, counted from earn rows; caps documented as anti-farm)
- `GET /api/server-templates` — already exists, untouched
- `GET /api/packs` (public) → published packs: id/slug/name/description/author/price/downloads/featured/created + `owned` flag when authed
- `GET /api/packs/:id/manifest` → 403 unless free/owned/owner; `?install=1` increments downloads (boot refetch must NOT count)
- `POST /api/packs` (create draft w/ manifest+price), `PATCH /api/packs/:id` (owner), `DELETE /api/packs/:id` (owner; unpublish = published=false, keep both)
- `POST /api/packs/:id/buy` → spend buyer → grant creator 100% → ownership row → return manifest → client installs. Edge cases: own pack → 400 (no self-dealing); insufficient → 400 with `need` amount; repeat buy returns manifest free
- `POST /api/reports {content_type, content_id, reason, details?, evidence_url?}` (reason required, preset list)

## 7. UI builds
- **Earn panel** (profile new card): balance, quest list with claim buttons, daily claim button. No new page.
- **Builder** (themes page, owner-only section): visual controls (8 color pickers bound to manifest colors.*, radius slider, font selects from allowlist, icons default/neon, motion calm/playful, background none/scene-with-params/image-upload-to-pack-assets, tags, price number input, publish toggle) + JSON-paste fallback through same validation + live store-card preview + Try-live toggle (applyPack, revert on exit).
- **Store merge**: static index.json + DB packs, sort featured → newest; priced cards show price + Buy-or-own button (free → Install as today); owned badge state.
- **Boot/install fallback**: engine tries static path, then `/api/packs/:id/manifest` (respects gating).
- **XSS fix (required before user content flows)**: `escapeHtml` all manifest-derived strings in store renderer; hex-only colors into style attributes.
- **Reports UI**: Report link on every pack card → modal (reason select required, details optional, picture file input optional → report-evidence upload) → POST; toasts confirm.

## 8. Execution order
1. Migration (coins + packs + reports + both buckets) → push → verify tables/policies
2. Coins core: RPCs, /api/coins, quests + claim, daily, trickle, Earn panel
3. Packs backend: CRUD, validation, manifest gating, purchase w/ 100% cut, ownership
4. Builder + store merge + install/boot fallback + XSS fix
5. Reports UI + owner delete/unpublish
6. Verify: syntax-check all scripts, boot server, 401/auth sweeps, happy-path walkthrough (earn → buy → install → report), advisors check, commit + push

## 9. Risks / watch items
- Static packs can't be DRM-gated; enforcement lives at the manifest API. Stated, accepted.
- Alt-account coin farming: mitigated by caps + signed-in-only + ledger audit; not eliminated — acceptable at play-money stakes.
- Report review is manual SQL until volume justifies a dashboard.
- No change to theme-engine.js needed; no change to the built-in pack, landing, login, editor, or studio.
