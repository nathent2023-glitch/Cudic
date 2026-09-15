# Glox — Project Memory & Credentials

## Project Overview
- Real-time chat lobby web app with persistent messages, OAuth login, split deployment
- Working directory: `C:\Users\sophi\OneDrive\Desktop\Glox`
- GitHub repo: `nathent2023-glitch/glox` (branch: `master`)

## Deployment URLs
- Frontend (Vercel): `https://glox-two.vercel.app`
- Backend (Render): `https://glox-o7rr.onrender.com`

## Supabase
- Project: `opimjwmgmzwapkzgxvhk`
- URL: `https://opimjwmgmzwapkzgxvhk.supabase.co`
- Anon key: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9waW1qd21nbXp3YXBremd4dmhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0ODk2NjYsImV4cCI6MjEwNTA2NTY2Nn0.fU0WlDVrxnRR5veEk4kI6K4HklQoVtxkzPWMH5SSo7A`
- Service role key: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9waW1qd21nbXp3YXBremd4dmhrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4OTQ4OTY2NiwiZXhwIjoyMTA1MDY1NjY2fQ.701-ayH7xrBZ6rEXXDd1lyVFQXg0AQjKiQul63paJxU`
- DB password: `Lbccx14660!`

## GitHub OAuth App (for Supabase GitHub login)
- Client ID: `Ov23IioZd8mBTSsE5VAq`
- Client Secret: `6c7f04e7723f9a03616e87ed34f44efe6b272b4f`
- Callback URL: `https://opimjwmgmzwapkzgxvhk.supabase.co/auth/v1/callback`

## Render Environment Variables
- `SUPABASE_URL` = `https://opimjwmgmzwapkzgxvhk.supabase.co`
- `SUPABASE_ANON_KEY` = (same as above anon key)
- `SUPABASE_SERVICE_KEY` = (same as above service role key)

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
