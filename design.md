# Glox Design System

Glox is a browser tool for building and playing small 3D games — a scene
editor with live scripting, chat lobbies, and a public gallery. The UI
should feel like a **workshop for builders**, not a generic SaaS dashboard:
technical but warm, confident, a little playful. It should NOT feel like a
templated dark-mode admin panel.

This file is the single source of truth for colors, type, spacing, and
component rules. When building or editing any screen, check it against
this doc before shipping. **The `/editor` route is exempt** — see
"Scope" at the bottom.

---

## 1. What we're moving away from

The old UI hit three of the most common "AI-generated" tells. Naming
them so we don't drift back into them:

- **Near-black background + one bright acid-green accent on everything** —
  buttons, active nav state, toggles, links all share the same lime,
  so nothing is actually emphasized. (Retired with the dark theme —
  the palette below is light-only.)
- **Emoji as icons** (🏠💬🎮🔧) — inconsistent weight, size, and style
  against each other.
- **ALL-CAPS micro-labels** ("NAVIGATE", "ACCOUNT", "OR JOIN WITHOUT AN
  ACCOUNT", "CAMERA PREVIEW") used as the only hierarchy device.
- Empty states are a floating stock icon + generic copy ("No lobby
  selected" / "Join a lobby from the home page") with no relation to the
  rest of the product.

## 2. Color

Base is a light ice-blue "playground" tone — friendly and Scratch-like,
not a stark clinical white — with **one purple signal color** reserved
for primary actions and active state, and **one orange accent** reserved
for "live" / play-related moments only. There is no dark theme and no
theme toggle; the app is light-only.

| Token | Hex | Use |
|---|---|---|
| `--ink` | `#E8EEFA` | App background (ice blue) |
| `--panel` | `#FFFFFF` | Sidebar, cards, inputs |
| `--panel-raised` | `#E2E9FA` | Hover / active surface, popovers |
| `--line` | `#C9D5F0` | Hairline borders, dividers |
| `--text-primary` | `#2E2A4B` | Headings, primary text |
| `--text-secondary` | `#5C5878` | Supporting text, labels |
| `--text-tertiary` | `#9C97B8` | Disabled, placeholder |
| `--signal` | `#774DCB` | Primary buttons, links, active nav, focus ring |
| `--signal-hover` | `#643BAD` | Signal hover/pressed |
| `--ember` | `#FF8C1A` | "Play", "Publish", live/online indicators only (solid fills, dark text) |
| `--ember-deep` | `#B25E00` | Small ember-colored text on light backgrounds (badges) |
| `--success` | `#14965F` | Success states |
| `--danger` | `#E0442E` | Destructive actions, errors |

**Rule:** `--signal` is the only saturated color allowed on interactive
chrome (buttons, active states, focus, links). `--ember` never appears on
navigation or structural UI — only on things that mean "this is live /
playable right now" (a Play button, an online dot, a "published" badge).

## 3. Type

Two families, each with a job. No third "decorative" font.

- **Space Grotesk** — all headings, the wordmark, and button labels.
  Geometric and a little technical, which fits a building tool. Weights
  500/600 only.
- **Inter** — all body copy, form fields, nav labels, descriptions.
  Weights 400/500.
- **JetBrains Mono** — reserved for actual code and technical values:
  the script editor, object/variable names, lobby codes, file names.
  Never used for decorative labels — if it's not literally code or an
  identifier, it isn't in mono.

Scale (rem, 16px root):

| Token | Size | Use |
|---|---|---|
| `--text-xs` | 0.75rem | Meta text, timestamps |
| `--text-sm` | 0.875rem | Secondary text, labels |
| `--text-base` | 1rem | Body, inputs |
| `--text-lg` | 1.25rem | Section headings |
| `--text-xl` | 1.625rem | Page titles |
| `--text-2xl` | 2rem | Hero / auth panel headline |

Labels use **sentence case**, not all-caps. Where a small caption needs
visual weight, use `--text-secondary` color + `--text-xs` size instead of
uppercase tracking.

## 4. Spacing, radius, elevation

- Spacing scale: `4 · 8 · 12 ·16 · 24 · 32 · 48 · 64` px. Pick from this
  list only — no arbitrary values.
- Radius: **two sizes only** — `6px` for controls (buttons, inputs, chips),
  `12px` for containers (cards, panels, modals). Dividers and hairlines
  have no radius.
- No drop shadows. Elevation is communicated with a `1px solid var(--line)`
  border and a background step up to `--panel-raised` — flatter, more
  "workbench," avoids the generic soft-shadow-card look.

## 5. Iconography & the logomark

- Replace all emoji icons with a single icon set, one stroke weight
  (1.5px), 20px default — e.g. Lucide or Phosphor (outline variant).
  Home / Chat / Games / Editor / Settings all come from the same family.
- Wordmark: `glox` in Space Grotesk 600, with the accent dot recolored
  from lime to `--signal`.
- Logomark (new): a simple isometric cube outline — a nod to the 3D scene
  the editor builds. Used as the favicon and loading state; a single
  reusable SVG, not a photo/gradient blob.
- A subtle **dot-grid** (matching the editor's floor grid) is the one
  recurring background texture, used only on: the auth screen's brand
  panel, and empty states. It's the visual thread that ties the rest of
  the app back to the editor. Don't use it as decoration everywhere —
  restraint is the point.

## 6. Components

**Buttons**
- Primary: solid `--signal`, white text, `6px` radius, no shadow. Hover =
  `--signal-hover`.
- Secondary: transparent, `1px solid var(--line)`, `--text-primary` text.
  Hover = `--panel-raised` background.
- Play/Publish (ember-tier, use sparingly): solid `--ember`, `--ink` text.
  Reserve for the literal Play/Publish actions in the editor and gallery.
- Never more than one primary button visible in a given view.

**Nav (sidebar)**
- Active item: `--signal` left-edge bar (2px) + `--panel-raised`
  background tint — not a full-fill green block.
- Icon + label, consistent icon set (section 5).
- Account row at the bottom: avatar as an initial in a `--signal`-tinted
  circle, name in `--text-primary`, status ("Signed in" / "Not signed in")
  in `--text-secondary` — not colored green/status-dot unless actually
  online in a lobby.

**Empty states** (Chat with no lobby, Games gallery with no games, etc.)
Use one consistent pattern:
1. Icon from the shared set inside a soft `--signal`-tinted circle (not a
   floating emoji).
2. Heading in interface voice, specific to the situation — "No lobby
   yet" not "No lobby selected."
3. One line of guidance in `--text-secondary`, written as an instruction:
   "Join or create a lobby from Home to start chatting."
4. One primary button that does the actual next step.
Optionally show the dot-grid texture behind the icon at low opacity.

**Auth / Home screen**
Replace the single centered card floating on a starfield with a
**two-panel split**:
- Left panel (60%): `--ink` background with the dot-grid texture, the
  logomark, the wordmark, and one short line of product copy (e.g. "Build
  small 3D games, together.") — this is the hero, it should look like the
  product, not a marketing stock photo.
- Right panel (40%): the actual form, on `--panel`. Sign in / Create
  account as an underline tab pair (not two competing filled buttons).
  "or join without an account" in sentence case as a plain divider line,
  not a bordered ALL-CAPS pill.
On narrow viewports, stack: brand panel becomes a short header band above
the form.

## 7. Motion

One deliberate motion moment per screen, nothing more:
- Auth screen: the dot-grid drifts very slowly (parallax), respects
  `prefers-reduced-motion`.
- Tab / route switches: a 150ms fade, no slide-and-fade-up on every
  element.
- No hover animation on every card — only on things the user can actually
  activate (buttons, nav items).

## 8. Voice

- Sentence case everywhere, active voice, no filler.
- Buttons say the outcome: "Create lobby," "Save changes," "Publish game"
  — not "Submit."
- Empty/error states explain what happened and what to do next, in the
  product's voice, not an apology. "No lobby yet — join or create one
  from Home." not "Oops! Nothing here."

---

## Scope note

**`/editor` and everything inside it (scene view, code panel, inspector,
camera preview, toolbar) is out of scope for now** and should not be
touched by a redesign pass — it works and shouldn't be put at risk. New
editor work going forward should still adopt the color tokens and type
scale above where it's a low-risk change (e.g. panel backgrounds, text
color), but structural changes to the editor are a separate, deliberate
task.
