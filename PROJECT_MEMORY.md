# Cudic — Project Memory & Credentials

## Project Overview
- Real-time chat lobby web app with persistent messages, OAuth login, split deployment
- Working directory: `C:\Users\sophi\OneDrive\Desktop\Glox`
- GitHub repo: `nathent2023-glitch/Cudic` (branch: `master`)

## Deployment URLs
- Frontend (Vercel): `https://glox-two.vercel.app`
- Backend (Render): `https://glox-o7rr.onrender.com`

## Supabase
- Project: `opimjwmgmzwapkzgxvhk`
- URL: `https://opimjwmgmzwapkzgxvhk.supabase.co`
- Anon key / Service role key / DB password: MOVED to local `.env` (gitignored) — never commit secrets
- CLI access: `SUPABASE_ACCESS_TOKEN` user env var (read-only token, revoke at supabase.com/dashboard/account/tokens)

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
- Wants impressive UI — dark theme, split layout, glassmorphism
- Do NOT delete `agora.db` files (Live Share)

## Completed Work
- Core chat app (WebSocket, lobbies, presence, typing indicators)
- Dark theme UI, responsive mobile sidebar
- Render + Vercel deployment
- Supabase integration (auth, message persistence)
- Login page redesigned with split layout
- GitHub OAuth configured in Supabase

## Remaining Work
- Enable GitHub provider toggle in Supabase (client ID + secret pasted, need to toggle ON and save)
- Test GitHub OAuth login end-to-end
- Potentially add more polish/features
