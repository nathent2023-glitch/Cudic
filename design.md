# Cudic design system — v2.0 (asset-pack based) · 2026-10-27

Single source of truth: **`public/cudic-assets/`**. Its `README.md` is the pack manual and
`manifest.json` is the machine-readable canon (every icon as an 8×8 pixel grid + cursor
hotspots). `brand/colors.json` holds the palette and `brand/tokens.css` holds the CSS
variables — import both when styling a page.

```css
@import url('https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&family=Geist+Mono:wght@400;700&display=swap');
@import url('/cudic-assets/brand/tokens.css');
```

This file replaces the previous design system (light-only Epilogue/Satoshi palette,
`--signal #7300FF`, Underground Blue). The system is: **ink-dark canvas, grid-led
layout, hard-edged lime/blue accents, pixel-art icons — Geist everywhere.**

---

## 1. File map (what ships in `/cudic-assets/`)

```
cudic-assets/
  README.md             pack manual (2.1KB)
  manifest.json         16KB — per-icon pixel strings + all cursor hotspots/fallbacks
  brand/
    colors.json         the 8 palette colors
    tokens.css          --cudic-* CSS variables (colors, fonts, motion)
    logo/
      cudic-mark-*.svg  one mark, 4 recolors: ink, cream, lime, blue (5.8KB each)
  icons/
    icon-sheet.png      contact sheet, every icon at once
    svg/<category>/     83 icons — 7 categories (roster in §4)
    png/{dark,light}/16|32|64/<category>/   83 × 6 = 498 PNGs
  emoji/
    emoji-sheet.png     contact sheet
    svg/                30 SVGs, 32×32 (16×16 art at 2×)
    png/{32,64,128}/    30 × 3 = 90 PNGs
  cursors/
    pixel/{cream,ink}/{svg,png,cur}/        10 each (SVG + PNG + Windows .cur)
    fluid/{cream,ink}/svg/                  10 each, vector only
    css/                4 drop-in sheets: pixel-cream / pixel-ink / fluid-cream / fluid-ink
```

Fonts (Geist, Geist Mono) are **not bundled** — pull from Google Fonts (SIL OFL).

## 2. Palette — dark & light modes

Both modes use the same eight tokens. **Dark is the default** (no `data-theme`
override = dark). Light exists because the pack ships paired variants (icon PNG
folders, cursor sheets, logo recolors) — flip the tokens and pick the matching
variants from the mode-swap table below.

**Dark mode (default):**

| Token | Hex | Role |
|---|---|---|
| `--cudic-ink` | `#0d0e10` | Canvas. Page & editor backgrounds. |
| `--cudic-cream` | `#f7f5ec` | Primary text on dark UIs. |
| `--cudic-lime` | `#b8f23a` | Primary accent: spark cells, active states, CTAs, markers. |
| `--cudic-blue` | `#3f7cff` | Secondary accent: alternate sparks, links, focus. |
| `--cudic-sky` | `#9fd0ff` | Sky tint — icon shading, info/graceful highlights. |
| `--cudic-panel` | `#14161b` | Surface — cards, panels, code blocks above the ink canvas. |
| `--cudic-line` | `#262a33` | Hairline borders and 1px grid rules. |
| `--cudic-mute` | `#9a9a94` | Muted body text, captions, meta. |

Contrast on the ink canvas (WCAG):

| Pair | Ratio | Verdict |
|---|---|---|
| cream on ink | ≈ 17.7:1 | AAA body text |
| lime on ink | ≈ 14.5:1 | AAA even for body-size text, but reserve for accents |
| blue on ink | ≈ 5.1:1 | passes AA body text / AAA large text |
| mute on ink | ≈ 6.8:1 | AA body text |

**Light mode (inverted pair):** canvas & text are pack canon (`cream` / `ink`);
the light neutrals and the deep-blue accent are v2 tunings derived from the pack's
own shades.

| Role | Hex | Source / note |
|---|---|---|
| Canvas | `#f7f5ec` (`cream`) | pack canon — replaces retired Underground Blue `#E8EEFA` |
| Text | `#0d0e10` (`ink`) | pack canon — **≈ 17.7:1** |
| Panel / card | `#fffdf6` | derived — warm near-white, never pure `#fff` |
| Line | `#d9d6c6` | derived — hairlines visible on cream |
| Muted text | `#5f5f56` | derived — ≈ 5.9:1, captions/meta |
| Links / text accents | `#1b3fb8` | pack canon (deep-blue icon shade) — ≈ 7.8:1, AAA |
| Lime accents | `#b8f23a` | pack canon — **fills only, always with ink text** (≈ 1.2:1 as text on cream → decorative) |
| Sky | `#9fd0ff` | info tints |

On light: `#3f7cff` remains valid for large text / UI accents (≈ 3.5:1, AA large
only); links and small emphasized text use the deep blue `#1b3fb8`. Focus ring on
light: `2px solid #1b3fb8`.

Baked icon spark cells (lime/blue) stay lime/blue in both modes — on cream they read
as a soft decorative accent; never the sole carrier of meaning.

Paired asset variants flip with the mode:

| Asset | Dark UI | Light UI |
|---|---|---|
| Icon PNG folder | `png/light/*` (cream icons) | `png/dark/*` (ink icons) |
| Cursor stylesheet | `pixel-cream` / `fluid-cream` | `pixel-ink` / `fluid-ink` |
| Logo recolor | `cudic-mark-cream.svg` | `cudic-mark-ink.svg` |

Rules:

- **Dark by default.** Ink canvas, panel surfaces, `1px solid #262a33` between
  everything. Never pure `#000` or pure `#fff` — the pack colors are tuned neutrals.
- **Lime and blue are accents, not surfaces.** Spark cells, marker dots, selected nav
  states, focused outlines, primary buttons. Never background fills larger than a
  button, never large text blocks. Blue links thru the site; lime means "active/here/now".
- **Hard edges.** Border-radius ≤ 3px. Flat fills. No glow, no gradients, no glass,
  no drop shadows except the fluid cursor's baked-in one.
- **Mode = token flip + variant swap.** Implement a mode change as one block of
  `--cudic-*` overrides (`[data-theme="light"] { … }`) plus the paired asset swap
  above — never per-element hex hunting.

## 3. Icon color-key (`manifest.json` pixel letters)

Each icon stores pixels as strings where every non-`.` cell is one of these letters.
The SVG generator maps them to concrete hexes:

| Letter | Hex | Meaning |
|---|---|---|
| `#` | `currentColor` | the ink body — set CSS `color:` to recolor |
| `a` | `#b8f23a` | **the spark** — lime accent cell(s). Every icon has exactly one distinctive spark region. |
| `o` | `#3f7cff` | blue accent fill (hearts, gems, screens — not orange) |
| `s` | `#9fd0ff` | sky — small shading/light cells (flag poles, gem highlights) |
| `r` | `#1b3fb8` | deep blue — shadow cells under `o` |
| `y` | `#e3ff9a` | pale lime — highlight cells under `a` |

`#1b3fb8` and `#e3ff9a` exist only inside icons; they're not palette tokens. Only the
`#` cells are recolorable — the accent letters are fixed hexes.

## 4. Icons (83, 8×8)

Drawn on a strict 8×8 grid: chunky 2-cell strokes, notched corners, one lime/blue
spark per icon. Not freeform pixel art every way — it's a system: silhouettes read at
16px, sparks make each icon recognizable among neighbors.

Roster by category:

| Category (n) | Icons |
|---|---|
| navigation (12) | home, menu, close, plus, minus, arrow, arrow-left, arrow-up, arrow-down, check, search, more |
| status (12) | info, warning, help, bell, clock, lock, eye, battery, wifi, power, settings, user |
| files (14) | folder, file, save, upload, download, copy, trash, pencil, share, image, database, filter, grid, list |
| studio (12) | terminal, code, bug, play, stop, sparkle, theme, remix, rocket, flag, cloud, chart |
| social (12) | chat, mail, globe, heart, star, crown, trophy, bookmark, gift, pin, calendar, cart |
| media (6) | music, volume, mute, camera, sun, moon |
| game (15) | gamepad, dice, coin, gem, sword, shield, potion, key, skull, ghost, bolt, cube, cursor, target, bulb |

Usage rules:

- **Scales in whole steps only: 16, 24, 32, 48, 64px** (and 2× of those for retina-crisp —
  the SVG is already crisp at any step). In-between sizes smear the grid.
- **Inline SVG, not `<img>`, when you want the recolor.** The ink path/rects use
  `fill="currentColor"`, so inline SVG inherits `color:`. An `<img src="*.svg">` stays
  the brand's raw color. Inline example:

  ```html
  <span class="menu-item" style="color:#f7f5ec">
    <svg width="16" height="16" viewBox="0 0 8 8"><use href="/cudic-assets/icons/svg/navigation/home.svg"/></svg>
    ... <!-- lime spark stays lime, ink body follows color -->
  </span>
  ```

- **PNGs need `image-rendering: pixelated`** when a size is upscaled:

  ```css
  .pixelated { image-rendering: pixelated; }
  ```

- **PNG folder naming is inverted from what it looks like:**
  `png/dark/*` = ink-colored icons **for light backgrounds**,
  `png/light/*` = cream-colored icons **for dark backgrounds**. Sizes 16 / 32 / 64.
- Use `<svg>` w/ `crispEdges` shape-rendering as the default; only reach for PNG when a
  canvas/context layout or a favicon-level embedding needs it.
- `icon-sheet.png` previews all 83; `manifest.json` can render any icon into a tiny
  grid of `<span>` or `<rect>` cells — no file fetch, per-icon pixel string in JS:

  ```js
  const rows = manifest.icons.coin.pixels;   // ["..aaaa..", ".aayyaa.", ...]
  // 'a' → lime, 'y' → #e3ff9a, '#' → currentColor, '.' → skip
  ```

Never edit these SVGs by hand — patch the manifest's pixel grid and re-derive.

## 5. Emoji (30)

**Faces (20):** smile, grin, laugh, joy, wink, love, starstruck, cool, blush, tongue,
kiss, neutral, sad, cry, shock, smirk, angry, cold, dead, sweat.
**Objects (10):** heart, star, fire, bolt, crown, gem, skull, rocket, trophy, gamepad.

- 32×32 — **16×16 pixel art shown at 2×**, ink outline with automatic
  highlight/shadow tones so every face matches the pack's feel. PNGs at 64/128 are
  nearest-neighbor scales of that same 16×16 art — never draw fresh detail into the
  64/128 layers.
- Where they're allowed: game payloads, reactions, celebratory/system pings, the two
  gallery/gallery game grid moments. **Not** as UI icons (that's §4) or in buttons —
  button labels state their outcome in plain Geist text (§7).

## 6. Cursors (10 × 4 sheets)

10 cursor types: default, link, text, crosshair, plus, move, resize-h, resize-v,
not-allowed, wait.

| Variant | Look | Ships |
|---|---|---|
| `pixel-cream` | cream fill + ink edge, 8×8 cells | `.svg` + `.png` + Windows `.cur` |
| `pixel-ink`  | ink fill + cream edge — for light UIs | `.svg` + `.png` + `.cur` |
| `fluid-cream`/`fluid-ink` | smooth vector, black arrow w/ thick white outline + soft shadow | `.svg` only |

| Cursor | pixel hot(x,y) | size | fluid hot(x,y) | fallback |
|---|---|---|---|---|
| default | 2,2 | 20×28 | 6,4 | auto |
| link | 2,2 | 20×28 | 6,4 | pointer |
| text | 8,14 | 16×28 | 16,16 | text |
| crosshair / plus / move / not-allowed / wait | 16,16 | 32×32 | 16,16 | crosshair / crosshair / move / not-allowed / wait |
| resize-h | 16,8 | 32×16 | 16,16 | ew-resize |
| resize-v | 8,16 | 16×32 | 16,16 | ns-resize |

Hotspots are baked into the CSS; the `fallback` keyword keeps native muscle memory.

Drop in:

```html
<link rel="stylesheet" href="/cudic-assets/cursors/css/pixel-cream.css">
```

- **Caution: the sheets set `cursor:` on `html, body`** — linking one swaps every
  cursor on the page. Pick one per page, not per section. If only some controls
  should feel pixel, use the sheet's `.cursor-*` classes:

  ```css
  <a href="#" class="cursor-move">draggable</a>
  ```

- Browsers can't animate image cursors, so `wait` is one still frame. Don't try to
  fake an animated cursor with JS — it thrashes the compositor.
- The fluid pointer is already black+white+shadow: over the ink canvas use
  `fluid-cream` (its white outline carries visibility); over a cream page use the
  `fluid-ink` variant.

## 7. Typography

- **Geist** (300–700) for everything: headings 600, UI/buttons 500, body 400.
  **Geist Mono** only for code, identifiers, hex values, numeric readouts, paths.
- Headings are sentence-case for content, allowed UPPERCASE only in the display
  moments (the `/brand` hero). Letter-spacing: tight on display sizes (-0.04em),
  neutral in UI (-0.01em), +0.1em ONLY in Geist Mono micro-labels — not in Geist.
- Type scale rides the grid: 12, 14, 16, 20, 24, 32, 48, 64px — multiples of the
  4px pixel cell and the 8px layout rhythm.
- Emoji as glyphs: never inside a sentence for play; keep in the §5 slots.
- Buttons **state the outcome** ("Publish game", not "Submit").

## 8. Motion

| Token | Value | Use |
|---|---|---|
| `--cudic-fast` | 120ms | hovers, focus rings, tooltip pop |
| `--cudic-base` | 240ms | fades, accordion, message slide-in |
| `--cudic-slow` | 600ms | page-level reveals |
| `--cudic-ease` | `steps(4)` | **the signature** — motion ticks like frame animation, matching the pixel art |

- `steps(4)` on anything default (opacity/transform), `steps(1)` (instant) for
  state collapses, standard `ease-out` only when a slide needs momentum.
- One deliberate motion moment per screen. Guard all decorative motion behind
  `prefers-reduced-motion` (hold the still frame).
- No parallax, no scroll-jacking, no infinite loops longer than a pulsing dot.

## 9. Applying it to pages

Page recipe (dark):

1. Canvas: `#0d0e10`; content in `#14161b` panels behind `1px #262a33` hairlines.
2. Vertical hairline grid running behind everything on wide screens; sections divide
   with horizontal hairlines. Every element aligns to that grid — that's the skeleton.
3. Nav band: thin bar, hairline bottom border, Geist Medium links; secondary links in
   `#9a9a94`. Active page gets a lime 2px inset underline, not a pill.
4. Hero (editorial, like `/brand`): massive tight display line (Geist 700, ≥ clamp
   3rem → 7rem, -0.045em), one line of muted sub, one lime CTA. Side accents: hard-
   edged lime/blue rectangles or a single pixel sprite. Max one sprite per page,
   4px-cell art, off to the side; never over text or controls.
5. Buttons: flat fill, 3px radius max. Primary = lime fill with ink text (accent —
   one per view). Secondary = transparent with 1px line border. Destructive = blue,
   never red — the pack has no red; lean on icon + copy to signal danger.
6. Footer: hairline top border, Geist Mono micro-caption.

Component specs:

- Card/panel: `#14161b`, `1px #262a33` border, 16px padding, hover = border-color
  `#3f7cff` (no lift, no shadow) — hover only on activatable things.
- Selected row / tab: lime 2px inset left edge or underline; never a lime background.
- Badge/pill: Geist Mono 12px, hairline border, ink text; live/online shows the lime
  spark via the `bolt` or `sparkle` icon at 12px.
- Focus ring: `2px solid #3f7cff` (blue = keyboards & focus), offset 2px, visible on
  dark and light.

Accessibility:

- Body text is cream (17.7:1). Muted (`#9a9a94`, 6.8:1) for captions only.
- Blue (5.1:1) is the floor for body-size text — don't dim it further.
- Lime marker meaning is always paired with text or an icon — lime color alone is not
  the only signal.
- Respect `prefers-reduced-motion`; keep one motion moment per screen.

## 10. Scope & governance

- The brand mark used at chrome level stays `public/cudic_sfsvg.svg` + `cucid.svg`
  (protected files — never delete). `cudic-assets/brand/logo/cudic-mark-*.svg` is the
  pack's own rendering of the same mark; use it where a recolor variant is needed.
- `/editor` and `/studio` keep their IDE-dark chrome and existing accent set — this
  system governs the **public pages and the `/brand` kit** (marketing, galleries,
  store, profile, chat surfaces).
- Adding an icon: draw it on the 8×8 grid in `manifest.json` (letters from §3),
  regenerate the SVG/PNG layers, bump the README counter. Never hand-patch a
  generated file.
- Breaking changes to palette or icon grid = major version bump here + in README.
