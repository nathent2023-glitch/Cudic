# Cudic palette — v2 (asset pack)

Canonical sources: `design.md` (v2) + `public/cudic-assets/brand/colors.json` +
`public/cudic-assets/brand/tokens.css`. This file is a mirror — don't diverge.

## Tokens (`--cudic-*` in tokens.css)

| Token | Hex | Role |
|---|---|---|
| `--cudic-ink` | `#0d0e10` | Canvas — page & editor backgrounds |
| `--cudic-cream` | `#f7f5ec` | Primary text on dark UIs |
| `--cudic-lime` | `#b8f23a` | Primary accent — spark cells, active states, CTAs, markers |
| `--cudic-blue` | `#3f7cff` | Secondary accent — alternate sparks, links, focus |
| `--cudic-sky` | `#9fd0ff` | Sky tint — icon shading, info/graceful highlights |
| `--cudic-panel` | `#14161b` | Surface — cards, panels, code blocks above the ink canvas |
| `--cudic-line` | `#262a33` | Hairline borders and 1px grid rules |
| `--cudic-mute` | `#9a9a94` | Muted body text, captions, meta |

## Light mode (inverted pair — derived; canvas/text are pack canon)

| Role | Hex | Note |
|---|---|---|
| Canvas | `#f7f5ec` | pack canon (`cream`) — replaces Underground Blue `#E8EEFA` |
| Text | `#0d0e10` | pack canon (`ink`) — 17.7:1 |
| Panel / card | `#fffdf6` | derived near-white — never pure `#fff` |
| Line | `#d9d6c6` | derived hairline |
| Muted text | `#5f5f56` | derived — 5.9:1 |
| Links / text accents | `#1b3fb8` | pack canon (deep-blue icon shade) — 7.8:1 AAA |
| Lime | `#b8f23a` | fills only, always with ink text (1.2:1 as text on cream) |

`#3f7cff` on light = large text / UI accents only (3.5:1, AA large).

Paired variants flip with the mode:

| Asset | Dark UI | Light UI |
|---|---|---|
| Icon PNG folder | `png/light/*` (cream icons) | `png/dark/*` (ink icons) |
| Cursor stylesheet | `pixel-cream` / `fluid-cream` | `pixel-ink` / `fluid-ink` |
| Logo recolor | `cudic-mark-cream.svg` | `cudic-mark-ink.svg` |

## Icon letter-key (manifest.json → generated SVGs; icon-only, not tokens)

| Letter | Hex | Meaning |
|---|---|---|
| `r` | `#1b3fb8` | deep blue — shadow cells under `o` |
| `y` | `#e3ff9a` | pale lime — highlight cells under `a` |

Mapping: `a` → lime `#b8f23a` · `o` → blue `#3f7cff` · `s` → sky `#9fd0ff` · `#` → `currentColor`

## Retired / mid-migration

Underground Blue `#E8EEFA`, `--signal #7300FF`, and the orange/yellow set
(`#FF512F`, `#FFB000`, `#FF8508`) are retired from the design system; sites/pages
still shipping them are mid-migration.

Fonts: Geist everywhere (headings 600, UI/buttons 500, body 400); Geist Mono only
for code, identifiers, hex values and numeric readouts.
