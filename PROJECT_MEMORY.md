# Cudic — Project Memory & Credentials

## Project Overview
- Real-time chat lobby web app with persistent messages, OAuth login, split deployment
- Working directory: `C:\Users\sophi\OneDrive\Desktop\Glox`
- GitHub repo: `nathent2023-glitch/Cudic` (branch: `master`)

## Deployment URLs
- Frontend (Vercel): `https://cudic.vercel.app`
- Backend (Render): `https://glox-o7rr.onrender.com`

## Supabase
- Project: `opimjwmgmzwapkzgxvhk`
- URL: `https://opimjwmgmzwapkzgxvhk.supabase.co`
- Anon key / Service role key / DB password: MOVED to local `.env` (gitignored) — never commit secrets
- CLI access: `SUPABASE_ACCESS_TOKEN` user env var (read-only token, revoke at supabase.com/dashboard/account/tokens)

## Test Inbox (throwaway Proton account for automated signup tests)
- Address: `opencodeaccount@proton.me` (password in local `.env`: `PROTON_TEST_EMAIL` / `PROTON_TEST_PASSWORD`)
- Read it by driving the browser to `https://mail.proton.me/u/1/inbox` — no IMAP/API on free Proton
- Login confirmed working 2026-10-16 at `account.proton.me/mail` (email + password in `.env`); a captcha can still appear on odd logins

## GitHub OAuth App (for Supabase GitHub login)
- Client ID: `Ov23IioZd8mBTSsE5VAq` (public identifier, safe to keep)
- Client Secret: MOVED to local `.env` — never commit
- Callback URL: `https://opimjwmgmzwapkzgxvhk.supabase.co/auth/v1/callback`

## Render Environment Variables (set in Render dashboard, not in files)
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY` (values in local `.env`)

## Database Schema
- Tables: `users`, `lobbies`, `messages`
- Trigger: `on_auth_user_created` — auto-creates user profile on signup
- RLS enabled with read for all, insert for authenticated

## User Preferences
- Beginner at web dev — prefers simple explanations
- PowerShell on this machine — use `;` not `&&`
- Does NOT want Google OAuth — only GitHub and email/password
- Wants impressive UI — dark grid-led editorial system (design.md v2), Geist + Geist Mono, lime/blue accents, hard edges — glassmorphism/gradients/purple are explicit anti-patterns now
- Do NOT delete `agora.db` files (Live Share)

## Completed Work
- Core chat app (WebSocket, lobbies, presence, typing indicators)
- Dark theme UI, responsive mobile sidebar
- Render + Vercel deployment
- Supabase integration (auth, message persistence)
- Login page redesigned with split layout
- GitHub OAuth configured in Supabase
- P2P collab editing in Studio (Yjs/y-webrtc rooms, live co-edit, chat, guest aliases) — pushed ea76000, 2026-10-29
- Follows + activity feed + awards system (badges/flairs/titles, equip 5/10/2 on profile; follow buttons on friends + creator pages) — local build 2026-10-29, migration applied, awaiting user OK to commit/push
- Mod grant page `/grant` (moderators only): search players, grant/revoke any award, inbox notify on grant; plus `/moderate` link
- Mod tools on `/grant` extended: send a message to a player's inbox, and temp-ban from chat & comments (`user_bans` table, `activeBan()` check in WS send + comment POST; unban lifts)
- Profile preview no longer silently stays at dashes on a failed/expired session — shows a sign-in nudge
- In-app inbox senders extended: like, follow, friend request, award (plus pre-existing comment/friend-accept); `notify()` helper + RLS hardened on `notifications` (was open to anon via PostgREST)

## Remaining Work
- Enable GitHub provider toggle in Supabase (client ID + secret pasted, need to toggle ON and save)
- Test GitHub OAuth login end-to-end
- Potentially add more polish/features
