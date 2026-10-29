# Cudic revenue-led expansion plan

Status: **Approved roadmap, not implemented yet.**

This is the detailed build plan for the ambitious Cudic expansion discussed with the user. Priorities:

1. Revenue and creator incentives lead.
2. Activation, discovery, Studio power, and community breadth all matter.
3. Trust, moderation, and anti-abuse controls come before opening the economy wider.
4. Coins are virtual-only and nonredeemable; crypto, loot boxes, and gambling mechanics remain out of scope.

Related project context:

- `product.md`
- `design.md`
- `plans/community-packs-coins.md`
- `plans/ctheme-language.md`
- `supabase/migrations/`
- `server.js`
- `public/games.html`
- `public/view.html`
- `studio/src/project.ts`
- `studio/src/glox.ts`
- `islands/src/`

---

## 1. Guiding decisions

### Product direction

Cudic remains a browser platform for:

- Making games and sites.
- Publishing playable projects.
- Playing other people’s work.
- Hanging out in chat and servers.
- Customizing the app through themes and packs.

The expansion should strengthen this loop:

```text
Discover a game
→ Play it
→ Support or follow its creator
→ Start from a template
→ Build in Studio
→ Publish
→ Get discovered and earn coins
→ Build again
```

Chat remains important, but games and creators lead. Chat should increasingly support:

- Finding collaborators.
- Sharing playable projects.
- Discussing games and jams.
- Supporting creators.
- Organizing servers and events.

### Economic rules

- Coins stay virtual-only and have no cash value.
- Do not add redemption, cash-out, crypto, payouts, withdrawals, or treasury/withdrawal behavior.
- Creators receive 100% of the virtual-coin price for pack sales; do not add a platform cut.
- No loot boxes.
- No fake scarcity.
- No pay-to-win advantages.
- Paid features are paid in virtual coins and may buy:
  - Content.
  - Convenience.
  - Cosmetics.
  - Creator support.
  - Discovery opportunities earned transparently, not hidden paid ranking.

### Technical rules

- Reuse existing authentication and security patterns:
  - `requireUser`
  - Seat/session validation
  - Email-verification gates
  - Rate limits
  - Service-role database access
  - Atomic coin RPCs
  - Parent-mediated game APIs for sandboxed iframes
- Never edit old applied Supabase migrations.
- Add one focused migration per feature area.
- Run Supabase advisors after schema changes.
- Rebuild Studio after changing `studio/src/`.
- Rebuild islands after changing `islands/src/`.
- Bump `?v=` cache pins after rebuilding shared frontend assets.
- Restart the backend after changing `server.js`.
- Pushing `master` deploys Vercel and Render, so verify locally first.

---

## 2. Phase 0 — Trust, moderation, and anti-abuse controls

### Why first

Tips, paid games, bounties, discovery boosts, and jams increase the incentive for:

- Spam accounts.
- Coin farming.
- Stolen or low-effort uploads.
- Fraudulent purchases.
- Vote manipulation.
- Abusive messages.
- Copyright or content disputes.

Phase 0 must land before the wider economy expands.

### 2.1 Expanded reporting

#### Goal

Let users report every major content type, not only theme packs.

#### Supported report targets

- Theme packs.
- Games.
- Chat messages.
- Users or creators.
- Optionally later:
  - Collections.
  - Jam entries.
  - Server content.

#### Required report fields

- `content_type`
- `content_id`
- `reason`
- Optional details.
- Optional screenshot or evidence upload.

#### Reason presets

Use separate presets per content type where appropriate. Examples:

For games:

- Broken or unplayable.
- Stolen or copied work.
- Spam or misleading listing.
- Inappropriate content.
- Malicious behavior or suspicious redirects.
- Copyright concern.

For messages:

- Harassment.
- Hateful content.
- Spam or scam.
- Sexual or age-inappropriate content.
- Threats or personal-information exposure.

For users:

- Impersonation.
- Repeated abuse.
- Spam or farming.
- Underage-safety concern.
- Ban evasion.

#### Implementation

- Extend report validation in `server.js`.
- Keep required reason and optional evidence behavior.
- Reuse the private `report-evidence` storage bucket.
- Add a shared report modal/button, preferably as a React island so it can be reused by:
  - Games.
  - Chat.
  - Servers.
  - Profiles.
  - Packs.
  - Collections.
  - Jam entries.
- Add report entry points on:
  - Game pages.
  - Pack cards.
  - Chat messages.
  - Creator profiles.
  - Servers where appropriate.

#### Acceptance criteria

- Every supported content type has a visible report action.
- Reports require a reason.
- Evidence upload remains optional.
- Invalid content IDs, missing reasons, and oversized evidence are rejected.
- Reporting does not expose reporter identity to the reported user.

#### Implementation status (2026-10-14, uncommitted)

- `POST /api/reports` now accepts `content_type: 'game'` (published games
  by id; owners may also flag their own draft). Pack flow untouched. Reason
  values shared, so pack and game reports land in one review queue.
- New `report-button` React island on game pages (`view.html`): Report
  button + modal (reason select, details, sign-in prompt for guests),
  shown after the game loads. Button sweep and send-state styling adapted
  from the `cudic-test` button library (`ShineButton`/`LoadingButton`)
  restyled in `.isl-` CSS — islands ship no Tailwind, so library components
  are ported, never imported directly.
- v1 omits evidence upload for game reports (reason + details only); the
  `/themes` pack flow keeps picture upload.
- 2.1 continued (2026-10-14, uncommitted): `POST /api/reports` also
  accepts `message` (reporter must see the room — no id probing) and
  `user` (no self-reports, target must exist). Chat has a hover Flag
  button on others' messages opening a modal with a message/sender
  toggle, reason select, and details. Message ids reach clients via the
  history select plus a `message_saved` WS patch correlated by a client
  `cid` — broadcast stays instant, no insert await on the hot path.
  Reports rate-limited (20/hour). Still open: collection, jam-entry, and
  server report targets.
- 2.2 built, migration NOT yet applied (2026-10-14, uncommitted):
  `GET /api/reports/mine`, `GET /api/reports/queue` (mod-only, with
  content previews), `POST /api/reports/:id/action` (dismiss / reviewing
  / actioned / unpublish game-or-pack / delete message, every action
  written to `moderation_actions`), and a minimal `/moderate` page.
  Needs `supabase/migrations/20261014120000_moderation.sql` run in the
  Supabase SQL editor, then the owner inserts their auth UUID into
  `moderators`. Pre-migration the queue 403s safely (no moderators).

#### Account-saved themes + music in Your Projects (2026-10-14, uncommitted)

- Theme drafts already persisted to the account (`POST /api/packs`,
  `?mine=1`); added a `/themes?edit=<id>` deep link so Your Projects
  rows open drafts straight in the builder (same path as Edit).
- Music was localStorage-only: new `music_tracks` table + `/api/music`
  CRUD (verify-gated, seat-checked writes, 100KB cap, owner-scoped).
  `music.html` gains title/track-picker/New/Delete/sync-status; signed-in
  users auto-sync (debounced cloud save, localStorage mirror), guests keep
  local only. Track switching reloads with `?track=` so one-shot UI
  builders never double-bind listeners.
- `games.html` Your Projects now unifies Studio projects + unpublished
  theme drafts + music tracks; empty state shows only when all three are
  empty. Needs `supabase/migrations/20261014130000_music_tracks.sql` run;
  pre-migration the music section silently stays empty (fetch fails soft).

#### Creator dashboard v1 (2026-10-15, uncommitted)

- `GET /api/creator/stats` (auth only): per-game plays/likes/comments/
  forks, per-pack downloads/sales/revenue, coin balance + 10 recent
  receipts, open-report count against own content. Follow-ups stay scoped
  to own ids; no migration.
- Your Projects gains a Creator overview section: stat tiles (plays,
  likes, comments, forks, pack downloads/sales, coins earned, balance,
  open reports) plus a top-5 games list.
- Still open: tips and paid-unlock stats (land with those features),
  pack revenue/download analytics beyond totals, recurring quests.

---

### 2.2 Minimal moderation queue

#### Goal

Stop relying on manual SQL once report and economy volume grows.

#### New tables

Create a focused migration, for example:

`supabase/migrations/20261015090000_moderation.sql`

Suggested tables:

```sql
create table if not exists public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  moderator_id uuid not null references public.users(id) on delete cascade,
  content_type text not null,
  content_id uuid not null,
  action text not null,
  reason text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists moderation_actions_content_idx
  on public.moderation_actions (content_type, content_id, created_at desc);

create index if not exists moderation_actions_moderator_idx
  on public.moderation_actions (moderator_id, created_at desc);
```

Also constrain report values if not already constrained:

- `content_type in ('pack', 'game', 'message', 'user')`
- `status in ('open', 'reviewing', 'actioned', 'dismissed')`

Use RLS so:

- Users can read only their own reports.
- Moderators/admins use service-role access through authenticated server endpoints.
- Direct client writes remain unavailable.

#### New endpoints

Suggested:

```text
GET /api/reports/mine
GET /api/reports/queue
POST /api/reports/:id/action
```

Queue filters should support:

- Status.
- Content type.
- Newest/oldest.
- Reporter history.
- Repeat-offender targets.

Moderator actions should support:

- Dismiss report.
- Mark as reviewing.
- Hide game or pack.
- Unpublish game or pack.
- Delete offending message or comment.
- Temporarily restrict publishing.
- Temporarily restrict chat.
- Escalate to owner review.

Use existing delete/unpublish endpoints wherever possible. The moderation endpoint should primarily:

- Check moderator permission.
- Apply the existing state change.
- Record the audit row.
- Update report status.

#### Moderator access model

Start simple and explicit:

- Store moderator/admin user IDs in server configuration or an allowlist table.
- Do not infer moderator status from coins, purchases, or public profile fields.
- Log every moderation action.
- Never allow moderators to alter coin balances directly except through audited compensation/refund endpoints.

#### Acceptance criteria

- Moderators can list, filter, and resolve reports.
- Every action creates an audit entry.
- Users can track their own submitted reports.
- No moderation privilege can be obtained through normal gameplay or purchases.

---

### 2.3 Coin-abuse controls

#### Goal

Keep the virtual economy honest without adding intrusive verification.

#### Rules to implement

- Only verified accounts can:
  - Earn creator revenue.
  - Tip.
  - Buy paid games or packs.
  - Claim high-value quests or bounties.
- Block:
  - Self-tipping.
  - Self-purchasing.
  - Duplicate purchases that charge twice.
  - Circular transfers between colluding accounts.
- Add configurable daily limits for:
  - Coins earned.
  - Coins spent.
  - Tips sent.
  - Tips received.
  - Purchases.
- Add velocity checks for:
  - New accounts earning unusually fast.
  - Repeated identical transactions.
  - Rapid buy/refund cycling.
  - Coordinated voting or tipping rings.
- Preserve full auditability through `coin_ledger`.

#### Implementation notes

- Keep using `grant_coins` and `spend_coins`.
- Use descriptive ledger reasons, for example:
  - `game_tip`
  - `game_tip_received`
  - `game_unlock_buy`
  - `game_unlock_sale`
  - `game_unlock_refund`
  - `bounty_award`
  - `fraud_reversal`
- Make refunds explicit ledger entries; never silently edit balances.
- Add server-side eligibility checks before transfer, not only in the UI.
- Reuse the pack purchase concurrency pattern:
  - Claim ownership/entitlement first where applicable.
  - Handle duplicate-key races safely.
  - Avoid double charging.

#### Acceptance criteria

- Farming and self-dealing cannot generate unlimited value.
- Every suspicious reversal is explainable in the ledger.
- Legitimate creators and buyers are not blocked by normal activity.
- Duplicate clicks do not create duplicate charges.

#### Implementation status (2026-10-14, uncommitted)

- `COIN_LIMITS` (`dailyEarn` 10000, `dailySpend` 1000, `buysPerHour` 10)
  plus `coinFlow()`/`dayStartIso()`/`hourAgoIso()` helpers, all ledger-read.
- Enforced on pack buy (the only open-ended value mover): buyer daily
  spend, purchase velocity, and seller daily earnings each 429 with a
  plain message. Free/repeat buys skip caps (no value moves).
- Already covered before this slice: verified-only quest/daily/pack-buy,
  self-purchase block, duplicate-key-safe buys, explicit `pack_refund`
  ledger entries, fixed-schedule quest/daily/trickle rewards, 20/hour
  report limit. Tipping/paid-game rules land with those features (Phase 1).

---

### 2.4 Publish safety validation

#### Goal

Prevent accidental publication of broken, empty, unsafe, or incomplete projects.

#### Publish checks

Before a project can be published, validate:

- Title is present and meaningful.
- Description/gameplay instructions are present.
- Thumbnail is present.
- Preview successfully mounts.
- Preview is not blank.
- Required entry behavior works.
- Local asset references resolve.
- No asset exceeds configured size limits.
- No obvious API keys, private keys, tokens, or secrets are embedded.
- No dangerous redirect or credential-exfiltration patterns in obvious places.
- Mobile viewport behaves acceptably for website-style games.

This should be advisory at first for drafts, but blocking for public publishing unless explicitly overridden by the owner/moderator workflow.

#### Implementation

Add a Studio command such as:

```text
Cudic: Check before publishing
```

Reuse:

- `collectTextFiles`
- `collectBinaryFiles`
- Preview assembly
- Thumbnail capture
- Asset manifest handling
- Existing publish API

Present results as:

- Blocking issues.
- Warnings.
- Passed checks.
- Direct links/buttons to fix each issue.

#### Acceptance criteria

- Every publish attempt can run validation.
- Blocking failures identify the exact missing file or problem.
- Validation does not alter project files.
- False positives are warnings rather than hard blocks unless security-related.

---

## 3. Phase 1 — Creator revenue and creator dashboard

### Why second

This is the user’s leading priority. It should launch only after Phase 0 controls exist.

### 3.1 Creator dashboard

#### Goal

Give every creator one place to understand performance and earnings.

#### Dashboard sections

For the signed-in creator’s own projects:

- Plays and recent play trend.
- Likes.
- Comments received.
- Forks/remixes.
- Tips received.
- Paid-game unlocks and revenue.
- Pack downloads and sales.
- Coin receipts and balance history.
- Unresolved reports against their content.
- Publish-readiness status for drafts.

#### Suggested endpoint

```text
GET /api/creator/stats
```

It should return only the caller’s own data and aggregate efficiently using:

- `games(owner_id)`
- `game_likes`
- `game_comments`
- Fork metadata
- `coin_ledger`
- `theme_packs`
- `pack_ownership`
- Download counters

Avoid loading every project, comment, or ledger row into the browser.

#### UI placement options

Preferred:

- Expand the existing “Your Projects” experience.
- Add a creator/overview section above project management.
- Link from game pages owned by the viewer.
- Link from profile and Studio.

The dashboard must distinguish:

- Drafts.
- Published projects.
- Under-review content.
- Paid content.
- Free content.

#### Acceptance criteria

- Creators can see performance and earnings without manual queries.
- No private draft or revenue data leaks to other users.
- Dashboard loads quickly for creators with many projects.
- Every revenue number can be traced to ledger or purchase records.

---

### 3.2 Game tipping

#### Goal

Let players directly support creators using virtual coins.

#### User flow

1. Player opens a published game.
2. Player clicks “Support creator.”
3. UI shows:
   - Creator name.
   - Current coin balance.
   - Suggested tip amounts.
   - Custom amount field.
4. Player confirms.
5. Server atomically:
   - Spends player coins.
   - Grants creator coins.
   - Writes ledger entries.
6. UI updates balances and shows confirmation.
7. Creator dashboard records the tip.

#### Suggested endpoint

```text
POST /api/games/:id/tip
```

Request shape:

```json
{
  "amount": 25,
  "message": "Optional short message"
}
```

#### Validation

- Game must exist and be published.
- Tipper must be signed in, verified, and session-valid.
- Amount must be within configured minimum/maximum.
- No self-tipping.
- No tipping deleted, hidden, or unpublished games unless the tipper owns them.
- Rate-limit tips per user, game, and time window.
- Protect against duplicate submissions and double-click races.

#### Acceptance criteria

- Tips transfer the exact confirmed amount.
- Both sides receive ledger records.
- No duplicate charges from retries or double-clicks.
- Failed transfers leave balances unchanged.
- Abusive tipping patterns are limited and auditable.

---

### 3.3 Paid games and unlocks

#### Goal

Let creators sell full-game access for virtual coins.

#### Data model

Add to `games`:

```text
price_coins integer not null default 0
```

Add entitlement table:

```sql
create table if not exists public.game_unlocks (
  user_id uuid not null references public.users(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, game_id)
);

create index if not exists game_unlocks_game_idx
  on public.game_unlocks (game_id);

create index if not exists game_unlocks_user_idx
  on public.game_unlocks (user_id, created_at desc);
```

Enable RLS and restrict direct client writes. All access goes through authenticated server endpoints.

#### Suggested endpoints

```text
POST /api/games/:id/unlock
GET /api/games/unlocked
```

Purchase behavior should mirror paid packs:

- Creator cannot buy their own game.
- Repeat unlock returns entitlement without charging again.
- Concurrent purchases use entitlement-first/idempotent logic.
- Failed purchase removes provisional entitlement and refunds if needed.

#### Player experience

Free preview should show:

- Title.
- Description and gameplay instructions.
- Author.
- Thumbnail.
- Price.
- Reviews/comments where appropriate.
- Limited demo if provided by creator.

Full player unlocks only when:

- Game is free.
- Viewer owns the game.
- Viewer has unlocked the game.
- Viewer is a moderator/owner handling a report.

#### Creator experience

Creators should be able to:

- Set a coin price.
- Change a price without revoking existing buyers.
- Unpublish without deleting buyer entitlements by default.
- See unlock counts and revenue.
- Issue defined refunds where appropriate.

#### Refund policy to define before implementation

- Deleted game: automatic or manual refund?
- Unpublished game: retain access or refund?
- Broken game confirmed by moderation: refund buyer and notify creator?
- Accidental purchase: short grace window or no refunds?
- Fraudulent purchase: reversal and moderation action?

Do not implement paid games without choosing these rules.

#### Acceptance criteria

- Buyers retain access after price changes.
- No double charges.
- Locked games cannot be accessed by guessing player URLs or iframe parameters.
- Refunds and reversals are explicit and auditable.
- Unpublished or removed games follow the documented buyer policy.

---

### 3.4 Better pack commerce

The pack purchase loop already exists. Phase 1 should improve discovery, transparency, and creator analytics rather than replacing it.

#### Add

- Pack sorting and discovery for:
  - Featured.
  - Newest.
  - Most installed.
  - Highest revenue.
  - Trending.
- Creator-facing metrics:
  - Downloads.
  - Purchases.
  - Revenue.
  - Refunds/reversals.
  - Active installs where measurable.
- Pack version/changelog metadata.
- Clear buyer-entitlement behavior after:
  - Price changes.
  - Manifest updates.
  - Unpublishing.
  - Pack deletion.
- Stronger store-card quality signals:
  - Live preview.
  - Author.
  - Ratings/feedback if added.
  - Report action.
  - Download/purchase counts.

#### Acceptance criteria

- Buyers understand exactly what they own.
- Updates do not silently revoke purchases.
- Creators understand pack performance.
- Paid and free packs remain clearly distinguishable.

---

### 3.5 Expanded quests and bounties

#### Goal

Use coins to reward valuable creation and community behavior, not just first-time onboarding.

#### Keep

Existing one-time onboarding quests:

- First published game.
- First DM.
- Complete profile.
- Join first server.
- Add first friend.
- Daily visit.

#### Add

Recurring or seasonal quests with strict caps. Examples:

- Publish a working game during an event.
- Receive legitimate plays from distinct users.
- Receive helpful comments or constructive feedback.
- Support another creator.
- Complete a game jam entry.
- Update a game based on feedback.
- Publish accessibility or mobile improvements.

#### Optional creator bounties, later in Phase 1

A bounty system would allow a user to offer coins for:

- A requested game.
- A theme pack.
- A bug fix.
- A tutorial.
- Art, music, or level contributions.

A safe initial version should:

- Lock bounty coins upfront.
- Define judging criteria.
- Define deadline and winner selection.
- Support cancellation/refund rules.
- Avoid open-ended escrow disputes.

If escrow complexity threatens the release, ship:

- Tips.
- Paid games.
- Paid packs.
- Expanded quests.

before bounties.

#### Acceptance criteria

- Quest rules are transparent.
- Rewards cannot be farmed repeatedly beyond intended caps.
- Every reward has a ledger reason.
- Bounty disputes have documented resolution rules.

---

## 4. Phase 2 — First-project activation and templates

### Why third

Revenue needs a healthy supply of new creators and published projects. This phase reduces time-to-first-preview and time-to-first-publish.

### 4.1 Curated Studio starter templates

#### Goal

Turn the existing seed games into a real onboarding path.

#### Templates to expose

- Pong.
- Snake.
- Breakout.
- Flappy-style game.
- Memory.
- Clicker.
- Tic-tac-toe.

Optionally add:

- Blank website.
- Blank canvas game.
- Platformer starter.
- Top-down starter.
- Visual-novel/dialogue starter.
- Music/interactive-audio starter.

#### Implementation

- Create a static template registry, for example:

```text
public/studio-templates/index.json
public/studio-templates/<template>/
```

Each template should contain:

- Template ID and title.
- Description.
- Learning goals.
- Suggested first edits.
- Thumbnail.
- Allowlisted project files.
- Asset manifest if needed.

Add Studio entry points:

- New-project template picker.
- Studio welcome/empty-state action.
- “Start from template” in games creation UI.
- Deep links such as:

```text
/studio?template=snake
```

Validate:

- Template ID.
- File extensions.
- File sizes.
- Asset references.
- No executable or unexpected binary payloads.

#### Acceptance criteria

- New users can open a working template without writing code.
- Templates load quickly and preview successfully.
- Template files follow the same structure as normal Studio projects.
- Malformed template requests cannot inject arbitrary files.

---

### 4.2 First-publish checklist

#### Goal

Turn publishing into a guided sequence instead of disconnected Studio and gallery actions.

#### Checklist steps

1. Create or open a project.
2. Run preview.
3. Save project.
4. Add title.
5. Add gameplay instructions.
6. Add thumbnail.
7. Run publish validation.
8. Publish.
9. Open the public game URL.
10. Test the public game as a signed-out visitor where applicable.
11. Share or embed the game.

#### Behavior

- Show progress in Studio and/or “Your Projects.”
- Persist progress for signed-in users.
- Celebrate first publish.
- Connect completion to the existing first-publish quest.
- Do not block experienced creators with mandatory tutorials.

#### Acceptance criteria

- New creators always know the next step.
- Checklist state survives reloads.
- Completed projects have metadata, thumbnails, and working previews far more often.

---

### 4.3 Guided errors and publish fixes

#### Goal

Reduce abandoned projects caused by confusing preview or publish failures.

#### Add

- Central publish-readiness panel.
- Plain-language explanations for:
  - Blank preview.
  - Missing entry file.
  - Missing CSS/JS sibling.
  - Missing asset.
  - Oversized upload.
  - Blocked external request.
  - Save conflict.
  - Publish API error.
  - Thumbnail-capture failure.
- Each error should include:
  - Cause.
  - Affected file.
  - Recommended fix.
  - Direct action/button where possible.

#### Acceptance criteria

- Common failures point to the exact file or setting.
- Users do not need to inspect raw server responses.
- Validation never modifies project files automatically.

---

## 5. Phase 3 — Discovery, creators, collections, and jams

### Why fourth

Once creators can earn and new projects flow reliably, discovery turns supply into retention.

### 5.1 True trending and better gallery behavior

#### Goal

Surface games that are currently gaining attention, not only historic all-time winners.

#### Trending signals

Use timestamped data for:

- Recent plays.
- Recent likes.
- Recent comments.
- Recent forks.
- Recent tips or unlocks, once available.

Weight signals to avoid rewarding:

- Refresh spam.
- Self-likes.
- Bot-like bursts.
- Low-effort re-uploads.

The existing play limiter is useful, but trending should also consider distinct-user and time-window behavior.

#### Implementation options

Preferred initial approach:

- Add a server-side trending query or RPC.
- Calculate velocity over rolling windows such as:
  - 24 hours.
  - 7 days.
  - 30 days.
- Reuse timestamped likes, comments, forks, and play updates.
- Avoid a separate event table until gallery volume requires it.

Later, if needed:

- Add a `game_events` table.
- Aggregate asynchronously.
- Cache trending snapshots.

#### Gallery improvements

- Add cursor-based pagination or “load more.”
- Preserve search, tag, and sort state in shareable URLs.
- Add sorts for:
  - Trending.
  - Most liked.
  - Most discussed.
  - Most remixed.
  - New creators.
- Improve mobile card density and readability.
- Avoid generic empty states; always provide the next action.

#### Acceptance criteria

- New high-quality games can reach players without already having massive all-time plays.
- Gallery remains fast as the catalog grows.
- Trending behavior resists simple refresh or self-engagement manipulation.

---

### 5.2 Featured and editorial discovery

#### Goal

Combine algorithmic discovery with human curation.

#### Add

- Moderator-controlled featured games.
- Curated sections such as:
  - Featured.
  - Trending.
  - New creators.
  - Jam winners.
  - Rising remixes.
  - Hidden gems.
- Transparent featured criteria.
- Featured start/end dates.
- Clear separation between:
  - Editorial picks.
  - Algorithmic trending.
  - Sponsored placement.

Do not allow secret paid ranking or undisclosed promotion.

#### Data model

Add:

```text
games.featured boolean not null default false
games.featured_until timestamptz
games.featured_reason text
```

Only moderators/admins may change these fields.

#### Acceptance criteria

- Featured content is intentional and time-bounded.
- Editorial picks do not permanently dominate discovery.
- Users can distinguish curation from popularity.

---

### 5.3 Creator pages and follows

#### Goal

Turn successful games into lasting creator audiences.

#### Creator pages

Add public creator routes, for example:

```text
/creator?id=<user-id>
```

Each page should show:

- Display name and avatar.
- Bio and interests.
- Published games.
- Aggregate plays and likes.
- Remix/fork lineage.
- Follow button.
- Support/tip button where eligible.
- Report action.

#### Safe public API

Add an endpoint such as:

```text
GET /api/creators/:id
```

Return only public data:

- Display name.
- Avatar.
- Bio/interests.
- Numeric public ID.
- Published games.
- Aggregate public stats.

Never expose:

- Email.
- Private settings.
- Draft projects.
- Revenue details.
- Session data.
- Moderation history.

#### Creator follows

Add:

```sql
create table if not exists public.creator_follows (
  follower_id uuid not null references public.users(id) on delete cascade,
  creator_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, creator_id)
);
```

Rules:

- No self-follow.
- Follow only users with public creator content or explicit creator visibility.
- Support unfollow.
- Support block/mute/report where needed.
- Add followed-creator filtering in the gallery or a followed-creators feed.

#### Acceptance criteria

- Creators accumulate an audience across multiple releases.
- Follows create meaningful return visits.
- Private user data remains private.
- Harassment vectors have reporting and blocking paths.

---

### 5.4 Collections

#### Goal

Let users organize and share groups of games.

#### Types

- Personal favorites.
- Custom playlists.
- “Start here” beginner collections.
- Jam collections.
- Creator-curated collections.
- Moderator-curated collections.

#### Data model

Suggested:

```sql
create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  description text not null default '',
  visibility text not null default 'public'
    check (visibility in ('public', 'unlisted', 'private')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.collection_items (
  collection_id uuid not null references public.collections(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (collection_id, game_id)
);
```

#### Behavior

- Only published games can appear in public collections.
- Private collections remain owner-visible.
- Unlisted collections are shareable by link but not browsable.
- Collection owners can reorder and remove entries.
- Game deletion removes the game from collections gracefully.

#### Acceptance criteria

- Collections are easy to create, share, and browse.
- Deleted or unpublished games do not break collection pages.
- Private collections stay private.

---

### 5.5 Game jams and events

#### Goal

Create recurring reasons to build, publish, vote, and return.

#### Jam model

Each jam should define:

- Title and theme.
- Description and rules.
- Start and submission deadlines.
- Voting window.
- Eligibility rules.
- Judging or voting method.
- Prizes, coins, badges, or featured placement.
- Content restrictions.

#### Suggested tables

```sql
create table if not exists public.jams (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  theme text not null default '',
  description text not null default '',
  rules text not null default '',
  starts_at timestamptz,
  submissions_close_at timestamptz,
  voting_closes_at timestamptz,
  status text not null default 'draft'
    check (status in ('draft', 'open', 'voting', 'closed')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.jam_entries (
  jam_id uuid not null references public.jams(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  entrant_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (jam_id, game_id)
);
```

Voting can initially reuse likes or add a dedicated jam-vote table with:

- One vote per user per entry.
- No self-voting.
- Voting-window enforcement.
- Fraud detection.

#### Jam pages should include

- Countdown and deadlines.
- Rules.
- Eligible entries.
- Voting controls during voting phase.
- Results and winner showcase.
- Links to templates and docs for newcomers.

#### Acceptance criteria

- Jams have unambiguous deadlines and rules.
- Late entries cannot be submitted.
- Votes outside the voting window are rejected.
- Winners receive promised rewards, badges, or featured placement.
- Vote manipulation is limited and auditable.

---

### 5.6 Notifications

#### Goal

Bring users back for meaningful events without creating notification spam.

#### Events to notify

For creators:

- New comments.
- Like/play/fork milestones.
- Tips.
- Paid unlocks.
- Pack purchases.
- Quest or bounty rewards.
- Report resolution affecting their content.

For players:

- New games from followed creators.
- Jam deadlines and results.
- Friend-request updates.
- Replies to their comments.
- Collection updates they follow.

#### Data model

Suggested:

```sql
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null default '',
  ref_type text,
  ref_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_unread_idx
  on public.notifications (user_id, created_at desc)
  where read_at is null;
```

#### Behavior

- Coalesce repeated events, for example:
  - “12 people liked your game” instead of 12 notifications.
- Add read/unread states.
- Add notification preferences.
- Add server-side endpoints for:
  - Listing.
  - Marking read.
  - Marking all read.
  - Deleting.
- Build a reusable notification island for:
  - Sidebar.
  - Games.
  - Chat.
  - Studio.
  - Profile.

#### Acceptance criteria

- Important events reliably generate notifications.
- Repeated activity does not flood users.
- Users can disable categories they do not want.
- Notifications deep-link to the relevant game, comment, jam, purchase, or conversation.

---

## 6. Phase 4 — Studio power and reusable game services

### Why last among the major phases

These are high-value platform investments, but they matter most after creators, content, discovery, and revenue loops exist.

### 6.1 Project revision history

#### Goal

Protect creators from bad edits and make experimentation safe.

#### Data model

Suggested:

```sql
create table if not exists public.project_revisions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  owner_id uuid not null references public.users(id) on delete cascade,
  label text not null default '',
  files jsonb not null,
  assets jsonb not null default '{}'::jsonb,
  content_hash text not null,
  created_at timestamptz not null default now()
);

create index if not exists project_revisions_game_created_idx
  on public.project_revisions (game_id, created_at desc);
```

#### Behavior

- Support manual named snapshots.
- Optionally create automatic snapshots before risky operations:
  - Major AI edits.
  - Scratch imports.
  - Template replacements.
  - Large asset changes.
- Support restore and preview-before-restore.
- Show concise revision differences where feasible.
- Enforce retention and size limits, for example:
  - Keep latest N revisions.
  - Expire old revisions.
  - Reject revisions above a configured size.
- Store asset-manifest references rather than duplicating binaries wherever possible.

#### Acceptance criteria

- Creators can recover from destructive edits.
- Revisions do not cause unbounded database growth.
- Restoring a revision produces a working project.
- Revision history is owner-private.

---

### 6.2 Standard game-services API

#### Goal

Give every game leaderboards, scores, achievements, and progress without requiring creators to build backend code.

#### Architecture constraint

Games remain sandboxed and must never hold user tokens. Extend the existing parent-mediated pattern:

```text
Game iframe
→ postMessage request
→ view/embed parent
→ authenticated server API
→ response back to game
```

#### Initial services

- Submit score.
- Retrieve top scores.
- Retrieve player best.
- Unlock achievement.
- List achievements.
- Read/write structured progress, building on the existing save system.

#### Suggested tables

```sql
create table if not exists public.game_scores (
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  score bigint not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (game_id, user_id)
);

create table if not exists public.game_achievements (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  key text not null,
  name text not null,
  description text not null default '',
  created_at timestamptz not null default now(),
  unique (game_id, key)
);

create table if not exists public.player_achievements (
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  achievement_id uuid not null references public.game_achievements(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (game_id, user_id, achievement_id)
);
```

#### Suggested endpoints

```text
POST /api/games/:id/scores
GET /api/games/:id/scores/top
GET /api/games/:id/scores/mine
POST /api/games/:id/achievements/unlock
GET /api/games/:id/achievements
```

#### Validation

- Signed-in, verified player where required.
- Valid game and entitlement.
- Numeric score bounds configured per game.
- Rate limits per player/game.
- Reject impossible score jumps or submission bursts.
- Preserve guest play where appropriate, but only persist competitive records for authenticated users.

#### Game client

Provide or expand a small framework-free client, for example:

```js
CudicScore.submit(12345);
CudicScore.top();
CudicScore.best();
CudicAchievements.unlock("first-win");
```

The client must communicate with the parent mediator, not call authenticated APIs directly.

#### Acceptance criteria

- Leaderboards work across devices for signed-in players.
- Scores cannot be submitted by unauthenticated direct API abuse without detection/limits.
- Achievement state persists.
- Game services do not compromise iframe sandboxing.
- Creators can enable or disable competitive features per game.

---

### 6.3 Reusable behaviors and snippets

#### Goal

Reduce repetitive game-development work while preserving the no-build workflow.

#### Add vetted snippets for

- Player movement.
- Jumping and gravity.
- Collision detection.
- Scoring.
- Lives and game-over flow.
- Restart behavior.
- Touch controls.
- Keyboard controls.
- Sound effects.
- Save/load progress.
- Score submission.
- Difficulty progression.
- Pause/resume.
- Mobile-friendly layouts.

#### Delivery options

- Studio snippet/command palette.
- Template-linked code modules.
- Docs with copy/paste examples.
- Starter-game implementations that demonstrate each behavior.

All snippets must work in:

- Studio preview.
- Published games.
- Embedded games.

No bundler, framework, or build step should be required.

#### Acceptance criteria

- Common mechanics can be added in minutes.
- Snippets follow current preview/publish behavior.
- Snippets do not introduce external unpinned dependencies without review.

---

### 6.4 Smarter Cudic AI builder workflows

#### Goal

Improve outcomes from the existing AI panel rather than expanding provider count for its own sake.

#### Prioritize

- Apply reviewed changes safely.
- Explain preview/runtime errors in plain language.
- Generate starter games from selected templates.
- Fix publish-validation failures.
- Improve gameplay instructions and difficulty.
- Add missing controls or mobile support.
- Refactor duplicated game logic.
- Preserve project structure and asset references.

#### Constraints to preserve

- Existing path normalization and file-write guards.
- Existing authentication, seat, verification, and proxy safeguards.
- Existing skill/tool behavior unless explicitly redesigned.
- Never expose provider keys.
- Never log secrets.
- Prefer reversible edits and revision snapshots before large AI changes.

#### Acceptance criteria

- AI suggestions turn into working project changes with minimal manual repair.
- AI errors identify files and lines rather than producing vague advice.
- Large AI edits can be rolled back through revision history.

---

## 7. Cross-cutting implementation checklist

### 7.1 Database

For every migration:

- Use `if not exists` where appropriate.
- Add indexes for new query patterns.
- Add RLS policies or explicitly document service-role-only access.
- Prevent direct client mutation of sensitive tables.
- Add check constraints for enums and numeric ranges.
- Test upgrade against existing data.
- Run Supabase security and performance advisors.
- Document the migration in `CHANGELOG.md` and relevant docs.

### 7.2 Backend

For every endpoint:

- Authenticate where required.
- Apply seat/session checks for state-changing account actions.
- Apply email-verification gates where required.
- Validate IDs, enums, numeric ranges, file sizes, and JSON shapes.
- Rate-limit abuse-sensitive routes.
- Return clear user-facing errors.
- Avoid N+1 queries on list endpoints.
- Scope follow-up queries to returned IDs, as the gallery likes implementation already does.
- Preserve existing route ordering, especially generic `/:id` routes.
- Add concurrency-safe purchase/entitlement logic.
- Never expose secrets, tokens, private emails, or moderator-only data.

### 7.3 Frontend

- Follow `design.md`.
- Use sentence case and outcome-oriented buttons.
- Provide specific empty states with one next action.
- Respect reduced-motion preferences.
- Keep one deliberate motion moment per screen.
- Use Lucide-style icons rather than emoji.
- Make dialogs keyboard-accessible.
- Add loading, empty, error, offline, and permission states for major features.
- Rebuild islands and bump cache pins after island changes.
- Rebuild Studio after Studio changes.
- Test light/dark behavior and theme packs where applicable.

### 7.4 Verification

Before pushing `master`:

- Restart backend after `server.js` changes.
- Rebuild affected frontend bundles.
- Test signed-out behavior.
- Test signed-in behavior.
- Test unverified-account behavior.
- Test multi-tab/session behavior.
- Test duplicate purchase, tip, unlock, vote, and quest-claim clicks.
- Test expired, invalid, and concurrent requests.
- Test moderation permissions with non-moderator accounts.
- Test deleted, unpublished, hidden, and private content.
- Verify production cache behavior.
- Check browser console for errors.
- Update docs and changelog entries.

---

## 8. Metrics for the expansion

Track outcome metrics, not vanity metrics.

### Activation

- Visitor-to-Studio-open rate.
- Studio-open-to-preview rate.
- Template-to-save rate.
- Template-to-publish rate.
- Median time to first preview.
- Median time to first publish.
- Publish-validation pass rate.
- Abandonment point in the first-publish checklist.

### Creator revenue

- Number of earning creators.
- Tips sent and received.
- Paid-game conversion rate.
- Pack conversion rate.
- Repeat purchases.
- Refund/reversal rate.
- Coin-quest completion rate.
- Creator retention after first earning.

### Discovery and community

- Plays per published game.
- Follows per creator.
- Return-visit rate.
- Notification open/action rate.
- Jam entries per event.
- Jam-vote participation.
- Collection creation and sharing.
- Comment and remix rates.

### Trust and safety

- Report volume by content type.
- Median report-resolution time.
- Repeat-offender rate.
- False-positive moderation rate.
- Coin-abuse alerts and reversals.
- Spam/farming account removal rate.

---

## 9. Suggested build order

### Milestone A — Safe economy foundation

1. Expanded reports.
2. Moderation queue and audit history.
3. Coin-abuse limits.
4. Publish validation.

### Milestone B — First revenue slice

1. Creator dashboard and revenue stats.
2. Game tipping.
3. Paid-game unlocks.
4. Pack commerce and analytics improvements.
5. Expanded recurring quests.

### Milestone C — Creator supply

1. Starter templates.
2. First-publish checklist.
3. Guided publish fixes.
4. Improved empty states.

### Milestone D — Demand and community

1. Trending and pagination.
2. Featured curation.
3. Creator pages and follows.
4. Collections.
5. Jams.
6. Notifications.

### Milestone E — Platform depth

1. Project revisions.
2. Leaderboards, scores, and achievements.
3. Reusable behaviors/snippets.
4. Smarter AI builder workflows.
5. Performance, accessibility, account export/deletion, and polish.

---

## 10. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Economy abuse and farming | Phase 0 controls, verification gates, caps, ledger audits, moderation queue. |
| Moderation overload | Clear reason presets, audit history, repeat-offender tooling, transparent jam/content rules. |
| Scope creep | Ship milestones A–E sequentially; do not start broad social features before revenue controls. |
| Database bloat | Revision retention limits, aggregation endpoints, pagination, indexes, advisor checks. |
| Render cold starts and backend load | Efficient scoped queries, rate limits, cached discovery snapshots only if needed. |
| Storage growth | Asset size limits, thumbnail downscaling, revision references instead of duplicated binaries. |
| Fraudulent or broken paid content | Purchase validation, refund policy, moderation actions, buyer-entitlement preservation. |
| Chat/community complexity | Keep games first; expand chat features only where they support creation, discovery, or events. |
| Breaking production | Local verification, auth matrices, concurrency tests, cache-pin discipline, no unrequested deploys. |

---

## 11. Current non-goals

Do not build these as part of this expansion without a separate decision:

- Loot boxes or gambling-like mechanics.
- Secret paid ranking or undisclosed promotion.
- Native iOS/Android apps.
- Real-time multiplayer game networking.
- Custom domains for published games.
- Full rebuild of the classic editor.
- Replacement of the existing hand-rolled backend with a framework.
- Conversion of the entire classic frontend to a new framework.

---

## 12. Community research — what Scratch / TurboWarp / GDevelop users ask for

Status: **Research complete (2026-10-16). Not scheduled.** Read alongside §3–§6 when
sequencing milestones; several findings confirm existing sections, two are not in
this plan at all (§12.4).

This section records external demand evidence. It does not change the roadmap by
itself — §12.3 maps each finding onto the phase that already owns it.

### 12.1 Method and confidence

Sources (two passes, last ~12 months): `r/scratch`, `r/turbowarp`, `r/PenguinMod`,
`r/gdevelop`, `r/gamedev`. Read-only inspection of posts and comment threads.

| Confidence | Findings |
|---|---|
| **High** | The editor-vs-platform gap; discovery feed requested by name; text/code mode; moderation as the reason people leave. Each appears independently in two or more communities. |
| **Medium** | Browser engines assumed slow; resentment of monetisation; abandoned-mod risk. |
| **Low** | Mobile editor demand. No Scratch users found complaining about it; one GDevelop developer shipped a game from a phone, which is not demand evidence. |
| **Negative finding** | Code.org and MakeCode are not viable communities (see §12.2 row 12). |

Caveat: this is a handful of threads, not a survey. Top comments cited range from
8 to 24 upvotes; the signals are trusted because they repeat across communities,
not because the samples are large.

### 12.2 Ranked actions

P0 = do first. P1 = high value. P2 = worth doing. P3 = do not bother.

| # | P | Action | Type | Evidence |
|---|---|---|---|---|
| 1 | **P0** | Build one genuinely good game in Cudic, then promote *that game* — not the tool | Growth | r/gdevelop "top tier engine" thread, top comment (24 up): *"all engines are graded by what they produce. No one has used GDevelop and produced a massive hit yet"*; repeated independently as *"it needs a hit"* |
| 2 | **P0** | Position as "editor AND community in one place" | Positioning | r/turbowarp (36 up): *"turbowarp doesn't have its own platform like Scratch does. Would've been SO much better if they did"* + r/scratch PenguinMod thread: *"CodeTorch, it's just penguinmod but you can share projects"* — the same gap, two people, months apart |
| 3 | **P0** | Real discovery feed in the gallery (Trending / New / For You) | Product | r/scratch, requested by name: *"If TurboWarp added a text mode and a for you page there would be no need for Scratch to exist"* |
| 4 | **P1** | Surface "edit as real code" as a headline feature, not an implementation detail | Positioning | Same quote, plus three rival projects exist for this alone: **Glitter IDE** (`glitter.nz`, a text language compiling to Scratch projects), **CodeTorch**, PenguinMod text extensions |
| 5 | **P1** | Make moderation predictable and non-punitive, and say so publicly | Trust | r/scratch migration thread (10 up): *"penguinmod does NOT have discriminatory ban waves OR awful moderation"* |
| 6 | **P1** | Prove the speed — a benchmark or a "look what it runs" demo | Product / Growth | TurboWarp's entire reason to exist is performance; r/scratch's top posts of the year are engine flexes (Mario 64 ported, 1440 up; Half-Life 2 WIP, 979 up; GTA 6 WIP, 840 up) |
| 7 | **P1** | A few templates **and tutorials** — polish over documentation | Growth | *"it needs a hit and a lot more advanced tutorials"*; *"I don't think it's the documentation… it's more about the overall polish"* |
| 8 | **P2** | Frame "Publish" like export/packaging | Product | *"Plus it has the built-in project packager!"* — the web-native version already exists |
| 9 | **P2** | Say "free" plainly, in one line | Positioning | *"the way they monetize… It doesnt hold to other engines"* |
| 10 | **P2** | Visible momentum — public changelog / recent-updates signal | Trust | *"Penguinmod is abandoned. It's literally broken now and it still is"* — mods die, maintained platforms win |
| 11 | **P2** | More capability / extensions | Product | r/PenguinMod: *"I love the Objects extension"* — extensions are PenguinMod's main draw |
| 12 | **P3** | ~~Code.org / MakeCode outreach~~ **Skip** | Growth | r/codeorg's best posts of the year have 2–5 upvotes; r/makecode is micro:bit hardware, not games; searching `code.org` across Reddit returned nothing. They are classrooms, not communities |
| 13 | **P3** | ~~Mobile editor~~ **Defer** | Product | No Scratch users found asking for it. See §12.1 confidence table |

### 12.3 Mapping onto this plan

| Research item | Already in this plan? | Action |
|---|---|---|
| Discovery feed (row 3) | Yes — §5.1 trending, §5.2 featured | Confirm; this is the single most explicit community request. Consider pulling forward within Milestone D. |
| Templates (row 7) | Yes — §4.1 templates, §6.3 snippets | Extend: templates are not enough, the evidence asks for **tutorials and worked examples**. Add an explicit tutorials deliverable to §4.1. |
| Moderation predictability (row 5) | Yes — §2.1, §2.2 | Extend: the plan builds the tooling but never says how moderation is *communicated*. Add a public, plain-language moderation policy to Phase 0 output. |
| Performance (row 6) | Partly — §9 Milestone E lists "performance" as polish | Reframe: performance is a **launch asset**, not a polish task. Move the benchmark/demo out of Milestone E. |
| More capability (row 11) | Partly — §6.3 snippets | Keep as planned. |
| Publish-as-export (row 8) | Yes — §3.3, publish flow | Framing only, no new build. |
| Free positioning (row 9) | **No** | Marketing copy, not a build task. |
| "Edit as code" headline (row 4) | **No** — Studio is already code-first but nothing says so | Framing only. |
| Flagship game (row 1) | **No** | See §12.4 — the largest gap in this plan. |

### 12.4 Promotion plan — the gap this document does not cover

Every section above is product work. The research says the binding constraint is
not features but **what people can point at**, so this plan needs a promotion
track it currently lacks.

The core finding, stated twice by different people:

> *"For better or worse all engines are graded by what they produce."*
> *"it needs a hit and a lot more advanced tutorials"*

**Action:** build one flagship game in Cudic to a standard worth showing on its
own, then promote the **game**. The tool is the second message, never the first.

**Channels, in current order of viability:**

1. **PostYourGame** (`postyourgame.com`) — external game listing, no account
   required, first post goes to review before publication. Submitted 2026-10-16
   (title *"Cudic — make and play small games in your browser, no install"*,
   categories *Building & simulation* + *Party & social*, platform *Browser*,
   stage *Early access*).
2. **Discord** — the Skool server `#general` channel. Posted 2026-10-16.
3. **Reddit** — **gated**. Do not post links from a low-trust account: that is the
   exact pattern that returns *"removed by Reddit"* (site-wide spam filter, not a
   shadowban — verified via the public r/ShadowBan feed). Build comment karma in
   no-threshold subreddits first; links only after ~50 comment karma and no
   repeated posting of the same domain.

**Do not:** link-drop the same domain repeatedly, post from a 0-day account, run
two accounts against each other, or appeal-spam. Each removed post reinforces the
filter.

### 12.5 Evidence appendix

| Quote | Source | Score |
|---|---|---|
| *"all engines are graded by what they produce. No one has used GDevelop and produced a massive hit yet"* | r/gdevelop, "Why isn't GDevelop considered a 'top tier' engine yet?" (59 comments) | 24 |
| *"turbowarp doesn't have its own platform like Scratch does. Would've been SO much better if they did"* | r/turbowarp, "turbowarp is LITERALLY better than Scratch" | 1 (thread 36) |
| *"CodeTorch, it's just penguinmod but you can share projects"* | r/scratch, "I am migrating to penguinmod" | 3 |
| *"If TurboWarp added a text mode and a for you page there would be no need for Scratch to exist"* | r/scratch | 8 |
| *"penguinmod does NOT have discriminatory ban waves OR awful moderation"* | r/scratch, migration thread | 10 |
| *"Penguinmod is abandoned. It's literally broken now and it still is."* | r/scratch, migration thread | 1 |
| *"Plus it has the built-in project packager!"* | r/scratch, migration thread | 2 |
| *"I love the Objects extension"* | r/PenguinMod | 12 |
| *"the way they monetize… It doesnt hold to other engines"* | r/gdevelop, top-tier thread | 6 |
| *"I don't think it's the documentation… it's more about the overall polish of the engine"* | r/gdevelop, top-tier thread | 2 |
| *"mostly because of the no-code thing… it's a bit hard to make something that's not built in"* | r/gdevelop, top-tier thread | 2 |

### 12.6 Not verified

- **No benchmark** of Cudic's preview/runner against TurboWarp. Row 6 assumes Cudic
  is genuinely fast; if it is not, that row becomes a liability rather than a
  selling point. Measure before claiming.
- **Rival tool liveness unchecked** — Glitter IDE and CodeTorch may be abandoned;
  that would weaken row 4's competitive framing.
- **Non-English demand** is unmeasured. One Japanese-language thread surfaced the
  recurring "Scratch or MakeCode Arcade first?" question, so the comparison question
  appears in other locales, but no data was gathered.
- **GDevelop forum threads** (off-Reddit) were not read, including a referenced
  discussion about developer frustration with functions.

---

## 13. Growth & community shortlist (2026-10-28)

Status: **Recorded. Not scheduled.** A 19-item shortlist from a planning pass.
Items already owned by an earlier section are flagged "planned" with the pointer;
gaps are new and get a one-line spec. Sequencing stays governed by �9 milestones.

### 13.1 The 19 items

| # | Idea | Status | Where it belongs |
|---|---|---|---|
| 1 | Named game URLs (`/g/snake` slugs) | ✅ Shipped | `games.slug` + `/g/:id` rewrites; library links and view share URL |
| 2 | Per-game share cards (OG image from thumbnail) | ✅ Shipped | `/g/:id` SSR meta — title, desc, `/g/:id/thumb`, twitter card (server.js) |
| 3 | Embed with "Made in Cudic" badge | ✅ Shipped | `embed.html` at `/embed` carries the brand chip |
| 4 | Public creator pages | ✅ Shipped | �5.3 (`/creator?id=`) |
| 5 | Monthly Build-Off challenge | Planned | �5.5 jams |
| 6 | Friends UI | ✅ Shipped | `friends.html` at `/friends` + `/api/friends` (list, request, accept/decline) |
| 7 | Follow + activity feed of followed creators | Planned | �5.3 (gallery filter/feed) |
| 8 | Star ratings alongside comments | ✅ Shipped | `game_ratings` migration (20261028150000) + view.html star widget |
| 9 | Achievements / badges on profiles | **Gap** | Profile page; �6.2 is per-game only |
| 10 | In-game "beat a friend's score" challenges | Planned-ish | �6.2 leaderboards + existing rooms |
| 11 | Studio starter templates | ✅ Shipped | `glox.startFromTemplate` + `public/studio-templates/` |
| 12 | Creator analytics dashboard | Planned | �3.1 |
| 13 | Project version history | ✅ Shipped | snapshot/restore palette commands + `/api/games/:id/revisions` |
| 14 | Collab editing (room-code P2P) | ✅ Shipped | Yjs/y-webrtc rooms in Studio (`studio/src/collab.ts`) |
| 15 | Coin gifting / tips | Planned | �3.2 |
| 16 | 2FA | **Gap** | Auth flow (email code TOTP) |
| 17 | Studio first-run onboarding tour | Planned-ish | �4.2 first-publish checklist |
| 18 | Creator-built comment controls (own game) | **Gap** | `view.html` / My Projects |
| 19 | PWA / offline install | **Gap** | Manifest + service worker for Studio/gallery |

### 13.2 New-gap specs (one line each, expanded when scheduled)

- **1. Slugs** *(shipped)*: add `slug` to `games` (unique, nullable), `GET /api/games/:slug`
  fallback, `vercel.json` rewrite `/g/:slug` ? `/view.html?id=�`-by-slug.
- **2. Share cards** *(shipped)*: runtime OG tags on `view.html` (title, thumbnail, author) �
  Vercel serves static HTML, so use a small SSR pass or `?id=` meta swap script.
- **3. Embed badge** *(shipped)*: `embed.html` already ships a brand strip; add a fixed
  "Made in Cudic" chip linking back to the game page.
- **6. Friends UI** *(shipped)*: list/invite/accept on a `/friends` page using the existing
  `friendships` table; DM shortcut per friend.
- **8. Ratings** *(shipped)*: 1�5 stars on `view.html`, one per user per game, rendered with
  comments; aggregate into gallery sort.
- **9. Badges:** profile badge row (first publish, 100 plays, jam winner, etc.),
  backed by a `badges` table + award on event.
- **14. Collab editing** *(shipped 2026-10-29)*: P2P Yjs rooms over public signaling
  — room codes (not share tokens), live text merge, chat, awareness names; no
  server relay on our infra.
- **16. 2FA:** opt-in TOTP or email-code on sign-in; seat gates unchanged.
- **18. Comment controls:** owner toggles comments on/off and can delete
  comments on own games (reuse moderation delete pattern).
- **19. PWA:** manifest + service worker for `/studio` and gallery; offline
  cache of app shell only (never user data).
