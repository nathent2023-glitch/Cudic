# Cudic

**Cudic** is a browser tool for building and playing small games and sites: chat lobbies, a game gallery, a scene/game editor, theme packs, and a VS Code workbench shell at `/studio`.

> Proprietary — see [LICENSE.md](LICENSE.md). You may not use, copy, modify, distribute, or host this code without permission.

## Surfaces

| Route | What it is |
|---|---|
| `/` | Marketing landing |
| `/login` | Auth (email/password + GitHub, guest mode) |
| `/chat` `/lobbies` | Chat lobbies |
| `/games` `/view` | Game gallery + play page |
| `/editor` | Classic editor (legacy, dark IDE chrome) |
| `/studio` | **Cudic Studio** — VS Code workbench (Vite + monaco-vscode-api). Where active work happens |
| `/themes` | Theme pack store |
| `/profile` | Profile (display name, avatar, bio, interests, theme, likes) |
| `/servers` `/moderate` `/music` | Community servers, moderation queue, account music tracks |

Two editors exist: `/editor` (classic, dark) and `/studio` (workbench, dark IDE chrome). `design.md` v2 governs the classic pages; both editors stay dark.

## Stack

- **Backend**: Node + `server.js` — one hand-rolled HTTP server (static files, REST API, WebSocket, email verification, AI proxy). No Express. `ws` for realtime, `@supabase/supabase-js` for auth + DB + storage, `nodemailer`/`resend` for verification mail.
- **Frontend**: plain HTML/CSS/JS in `public/` — no framework, no bundler for classic pages.
- **Studio**: Vite 6 → `public/studio/` (gitignored build output), monaco-vscode-api 37.x.
- **Islands**: React components compiled to a single IIFE bundle (`public/islands/`) for interactive bits inside classic pages.

## Getting started

```powershell
npm install
npm start          # node server.js → http://localhost:3000
npm run dev        # same

# Studio build (required before testing /studio changes — output is gitignored)
cd studio
npm run build      # → ../public/studio/
npm run dev        # vite dev server

# Islands (React components in classic pages — output IS committed)
cd islands
npm run build      # → ../public/islands/
```

Shell is PowerShell; use `;` not `&&`. Restart `server.js` after editing it (no hot reload). Rebuild Studio after editing `studio/src/`; rebuild + commit islands after editing `islands/src/`. Bump `?v=N` cache-busters on shared scripts after editing them.

## Environment

Core variables (in gitignored `.env` — never commit):

```
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_KEY
PORT
```

Optional: `GMAIL_CLIENT_ID/CLIENT_SECRET/REFRESH_TOKEN/SENDER`, `RESEND_API_KEY`, `GITHUB_CLIENT_SECRET`. `.env.example` lists the core four.

## Database

Supabase project `opimjwmgmzwapkzgxvhk`. Schema in `supabase/schema.sql`, dated migrations in `supabase/migrations/`. Key tables: `users`, `lobbies`, `messages`, `games`, `game_comments`, `servers`, `server_members`, `active_sessions`, `game_saves`, `theme_packs`, `music_tracks`.

## Deployment

| | |
|---|---|
| Frontend | Vercel → `https://cudic.vercel.app` |
| Backend | Render → `https://glox-o7rr.onrender.com` (PORT=10000) |
| Build | `cd studio && npm ci && npm run build` |
| Deploy | Push `master` → both auto-deploy |

## Documentation

- `AGENTS.md` — everything an agent needs to work in this repo (architecture, auth pattern, AI panel, Studio, gotchas). Read it before touching code.
- `design.md` — design system source of truth (palette, type, icons, cursors, motion).
- `PROJECT_MEMORY.md` — credentials index + user preferences.
- `public/cudic-assets/README.md` — asset/cursor pack manual.

## License

All rights reserved — see [LICENSE.md](LICENSE.md).
