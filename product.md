# Cudic — product

What this thing is, every surface it has, and how it should feel to use.
`design.md` owns visuals; this owns the product.

## What Cudic is

A browser tool for building and playing small games and sites — make a game,
publish it, play other people's, hang out in chat lobbies while you do it.
No install, no build step for the player: everything runs at
`cudic.vercel.app`. Not open source.

## Surfaces

| Route | What | Status |
|---|---|---|
| `/` | Marketing landing — animated, light editorial | shipped |
| `/login` | Sign in / create / guest (GitHub + email, no Google) | shipped |
| `/lobbies` | Lobby list + join | shipped |
| `/chat` | Lobby chat (persistent + per-session), typing/presence | shipped |
| `/servers` | Server list + comments | shipped |
| `/games` | Game gallery, publish/unpublish, comments | shipped |
| `/view` `/play` `/run` | Game view + play harness | shipped |
| `/profile` | Public profile, password, accent color, reduce motion | shipped |
| `/themes` | Theme pack store (v1: static packs, `anime-city-night` shipped) | shipped |
| `/music` | Music Lab — grid sequencer, synth stage, per-project saving | shipped |
| `/editor` | Classic editor, dark, legacy | shipped, no new features |
| `/studio` | Cudic Studio — VS Code workbench, files/thumbnails/publish, Cudic AI panel | shipped, active development |

## Core flows

1. **Play**: land → gallery → open a game → play. Account optional.
2. **Make**: sign in → Studio → edit files → Preview/Run → set thumbnail →
   Publish → appears in gallery.
3. **Hang**: lobbies → chat, with persistent rooms and server channels.
4. **Customize**: profile → accent color (4 presets + custom picker),
   themes page → install a pack, profile → reduce motion.

## Voice

Sentence case. Active. Buttons state the outcome ("Publish game", not "Submit").
Specific empty states with one next step — never "No X selected".
Friendly to beginners; no jargon in UI copy.

## Product rules

- Light palette for classic pages, dark for `/editor` and `/studio`
  (`design.md` is the source of truth).
- One deliberate motion moment per screen; respect reduce-motion.
- No Google OAuth. No account needed to browse/play.
- Pushing `master` deploys (Vercel frontend + Render backend) — verify first.
