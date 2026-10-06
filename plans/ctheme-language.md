# .ctheme — the Cudic theme language

A tiny line-based language that compiles to a pack manifest (the same JSON
the visual builder produces). One source of truth: the compiler enforces the
exact allowlists the server enforces, so anything that compiles will save.

## Rules

- One directive per line. Blank lines ignored. `#` starts a comment.
- Strings may be single- or double-quoted, or bare (no spaces) where noted.
- Last directive wins on duplicates. Unknown directives are compile errors
  with a line number. Everything is optional except `name`.

## Directives

```
name "Midnight Diner"        # required, 2–40 chars
description "Rain-slick diner glow."
price 50                     # integer 0–100000, coins (0 = free)
tags calm, neon, diner        # comma separated, up to 8, short
radius 12                    # integer 0–24

color ink #E8EEFA             # keys: ink panel raised line signal tp ts tt
color signal #7300FF          # values must be #rrggbb

font head "Space Grotesk"     # any of: Inter, Space Grotesk, Sora,
font body Inter               #   Manrope, Outfit, DM Sans, JetBrains Mono
icons neon                    # default | neon
motion playful                # calm | playful

background none
background scene city-night   # scenes: city-night, ember-field
opacity 55                    # background opacity, percent 10–100
param rain 130                # scene params, numbers only, up to 8
param hueA 315

background image asset("bg.jpg")   # or a full https:// URL
sidebar asset("rail.jpg")          # rail art, optional
sidebar none
```

## Images — asset()

`asset("file.jpg")` references an uploaded image by file name. Flow:

1. Upload images in the Assets well (goes to the `pack-assets` bucket).
2. Reference them with `asset("name")` in `background image` or `sidebar`.
3. At save time the compiler rewrites each reference to its hosted URL.

Compile errors if a referenced asset was never uploaded, or an uploaded
asset is over 10MB / not an image. Direct `https://` URLs are allowed too
(the server re-checks every URL).

## Advanced HTML/CSS (separate tab, not part of .ctheme)

- Custom CSS (up to 8000 chars) applied after pack variables.
- Custom HTML (up to 8000 chars) rendered as a background layer behind
  content. Sanitized on render: `div span p img video source` only, no
  scripts, no event handlers, `https:` sources only, inline styles scrubbed
  of `javascript:`/`expression()`.
- Both ride inside the manifest as `custom: { css, html }` and apply with
  Try-it-live and on install.

## Compiler API (public/ctheme.js)

- `CTheme.parse(text, assets)` → `{ manifest, errors[] }`.
  `assets` maps file name → hosted URL for `asset()` rewriting.
- `CTheme.generate(manifest)` → canonical `.ctheme` source text.
- `CTheme.sanitizeHtml(html)` → safe HTML string for the custom layer.

The server never compiles: it validates the submitted manifest with the
same allowlists (plus length caps on `custom`), so hand-written JSON that
passes validation is equally legal.
