# Cudic — ready-to-paste community posts

Rules for every channel: post as a builder showing work, answer every reply, copy is yours.
Adjust the game links to real screenshots you like. Don't cross-post the same text twice in one day.

---

## r/scratch ("Advanced Topics" forum or r/scratch — title first)

**Title:** I made a free tool that turns your .sb3 into a real HTML5 game you can put anywhere

**Body:**
Hi — I've been building [Cudic](https://cudic.vercel.app), a free website where you can open a Scratch .sb3 (or paste a project link) and it becomes a real, playable HTML5 game: it runs in an embed you can paste on any site, players don't need a Scratch account, and it keeps running even where Flash-era shared projects get stuck behind the website.

What it does:

- Upload .sb3 or paste a scratch.mit.edu link → it converts to a playable project (sprites, sounds, scripts preserved)
- One click "Publish" gives you a game page, a link, and iframe embed snippets for your own website/blog
- From there you can also edit the project files (HTML/CSS/JS) if you want to go beyond blocks

Nothing to install — it all runs in the browser. Feedback welcome, especially if your project doesn't import cleanly (big asset-heavy projects are supported; tell me what breaks).

**Comment to have ready (when someone asks "is it safe / does it steal projects?"):**
It's just a converter + host, like downloading your own project and re-uploading it — nothing gets shared from your Scratch account, I never see your login. Try it with a copy, not your main project.

---

## r/gamedev

**Title:** I built a browser studio that goes from "write a file" to "published game with a link" without a build step

**Body:**
Solo project — [Cudic](https://cudic.vercel.app). It's a VS Code-style workbench that runs entirely in the browser tab: file tree, tabbed editor, live preview + console. When you're happy, one click publishes the project: you get a gallery page, a thumbnail, a comment thread, and fixed + responsive iframe embed snippets players can host anywhere. Saves follow the player's account across devices, and every published game gets realtime rooms (up to 32 players) through a tiny client API.

Runs HTML/CSS/JS (multi-file ES modules ok, npm packages via esm.sh), Python via a browser runtime, and it imports Scratch .sb3 files as a starting point.

Why I built it: I kept making tiny games and every one died of "now I have to deploy it somewhere." Worth a look if you make browser games or jam games — happy to answer the "how does X work under the hood" stuff (realtime layer, sandboxing, Scratch import pipeline).

---

## r/webgames / r/incremental_games (shorter, player-facing)

**Title:** I made a free site where small games publish with one click and are playable from the link

**Body:**
[Cudic](https://cudic.vercel.app/games) — gallery of small HTML5 games, no accounts needed to play, progress saves to your account if you sign in. If you make small games, you can publish yours with one click from the built-in editor, and grab an embed for your own site. Feedback on the gallery or the pipeline welcome.

---

## Show HN

**Title:** Show HN: Cudic – browser studio that publishes small games in one click

**Text:**
Hi HN — I made Cudic ([https://cudic.vercel.app](https://cudic.vercel.app)), a VS Code-style workbench that runs as a web page: file tree, editor, live preview and console in one tab. The interesting part is the last step: one "Publish" click turns the project into a game page with an embeddable iframe, cloud saves, comment thread, and realtime rooms (32 players/room) over a small client API — no hosting setup, no build config.

Technical bits I'm happy to go deeper on:

- Sandboxed iframe execution (opaque origin), a postMessage bridge for saves/multiplayer, server-side identity
- Multi-file ES module imports rewritten into import-maps so relative imports work from data: URLs
- Scratch .sb3 import: zip → project.json → VM + scaffolding runtime, assets stored as data URLs / object storage
- A server-side model proxy so the in-editor AI panel can call 50+ LLM providers without leaking keys

It's free, no install. I'd love feedback on the publish flow end-to-end: make a file → preview → publish → embed.

---

## Discord (paste in the channel, 1–3 lines max)

A: I've been building Cudic — a browser IDE where you write a game and hit Publish; you get a link, an embed for your site, cloud saves and multiplayer rooms. Free: https://cudic.vercel.app
B (if showing the game instead): you can play it here (your game link) — made in a site I've been building that publishes browser games in one click, editor is right in the tab.

---

## Post-day checklist

- [ ] Each post has one screenshot or 20s recording of: writing a file → preview → publish → opening the link
- [ ] Reply to comments within the first 2 hours
- [ ] Never post the same body text in two subreddits the same day
- [ ] r/scratch: use "Advanced Topics" ("my new tool" posts are normal there), don't ad-break Scratch's community guidelines — frame as a tool, ask for import feedback
