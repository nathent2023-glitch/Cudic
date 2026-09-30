# Cudic landing page: light, elegant style guide

A light-theme palette, fonts and style rules for the Cudic landing page only. The goal is calm, editorial and confident, with no gradients, glow effects or glass cards.

## Palette

| Token | Hex | Role |
|---|---|---|
| paper | `#F7F3EB` | Page background |
| cream | `#EFE9DC` | Alternate section bands, cards, screenshot frames |
| ink | `#1F1D1A` | Headlines, body text, outline buttons |
| stone | `#6B655B` | Captions, `// labels`, secondary text (about 5.2:1 on paper) |
| vermilion | `#C43A21` | The primary button and one small accent per section (about 4.8:1 with paper text) |
| pine | `#24463B` | Text links and small status details |
| butter | `#F2C14E` | Marker highlight behind one word in the hero (always with ink text) |
| line | `rgba(31,29,26,.16)` | 1px borders and dividers |

Proportions: about 70% paper, 20% cream, 5% ink text-heavy areas, and under 5% in total across vermilion, pine and butter. Colour should feel rare, so it reads as intentional.

## Fonts

All free on Google Fonts.

| Role | Font | Notes |
|---|---|---|
| Headlines | **Instrument Serif** | Use the italic on one word per headline, for example *Build* small games. |
| Body and UI | **Inter** | 16 to 18px, line height 1.6, colour ink |
| Labels | **JetBrains Mono** | Small, in stone. For the `// three things, one tab` style labels |

Alternative for a more classical feel: **Cormorant Garamond** (headlines) with **Jost** (body). Use a slightly larger headline size, because Cormorant runs small.

Type scale:

- Hero headline: `clamp(3rem, 7vw, 5.5rem)`, line height 1.02, letter spacing -0.02em
- Section headline: `clamp(2rem, 4vw, 3rem)`, line height 1.1
- Body: 1.05rem, max width 60ch
- Labels: 0.75rem mono, lowercase

## Style rules

- **Whitespace is the luxury.** Section padding of 96 to 128px on desktop and 64px on mobile. Content max width about 1080px.
- **Flat surfaces.** No gradients, no glow, no blur, no big drop shadows. Separate things with 1px lines and the cream band colour.
- **One primary button per view.** Vermilion fill, paper text, 8px radius. The secondary button is transparent with a 1px ink border.
- **Real screenshots.** Put the Studio, gallery and theme pack screenshots in a cream frame with a 1px line border and a 12px radius. No fake device mockups.
- **Restrained motion.** Fade and rise of 12px over 400ms on scroll, and underline slides on links. No floating orbs or looping animations.
- **Sentence-case copy.** Short, plain sentences, as you already write them.

## Section by section

| Section | Background | Notes |
|---|---|---|
| Nav | paper, 1px line below | Wordmark `cudic.` in ink with the full stop in vermilion. "Open Studio" is the vermilion button. |
| Hero | paper | Instrument Serif headline with *small* in italic, and butter marker behind "instantly". Primary and outline buttons below. |
| Feature marquee (Scene editor, Live preview, etc.) | paper, line above and below | Mono labels in stone, separated by small dots. |
| "Three things, one tab" cards | paper | Cream cards with 1px line borders. Serif card titles, Inter body. |
| Editor section | cream band | Screenshot in a paper frame on the right, three bullets on the left. |
| Gallery | paper | Game cards in cream with thumbnails. Pine "published" status text. |
| Theme packs | cream band | Same layout as the editor section, mirrored. |
| Final call to action | paper | Large serif headline, "Start with an empty file.", with the vermilion button. |
| Footer | paper, 1px line above | Ink links, stone small print. |

Alternate paper and cream from section to section. That rhythm does the job that gradients and dark panels usually do.

## Contrast quick reference

| Pair | Approximate ratio | Use |
|---|---|---|
| ink on paper | about 15:1 | Everything |
| stone on paper | about 5.2:1 | Captions and labels |
| paper on vermilion | about 4.8:1 | Primary button |
| pine on paper | about 9.4:1 | Links |
| ink on butter | high | Highlight only |

Avoid vermilion or butter as small text on paper.

## CSS

```css
:root {
  --paper: #F7F3EB;
  --cream: #EFE9DC;
  --ink: #1F1D1A;
  --stone: #6B655B;
  --vermilion: #C43A21;
  --pine: #24463B;
  --butter: #F2C14E;
  --line: rgba(31,29,26,.16);

  --font-head: 'Instrument Serif', Georgia, serif;
  --font-body: 'Inter', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;
}

body {
  background: var(--paper);
  color: var(--ink);
  font-family: var(--font-body);
  line-height: 1.6;
}

h1, h2 { font-family: var(--font-head); font-weight: 400; letter-spacing: -0.02em; }
h1 em, h2 em { font-style: italic; }

.label { font-family: var(--font-mono); font-size: .75rem; color: var(--stone); }
.band  { background: var(--cream); border-block: 1px solid var(--line); }
.card  { background: var(--cream); border: 1px solid var(--line); border-radius: 12px; }

.btn-primary { background: var(--vermilion); color: var(--paper);
               padding: .7rem 1.2rem; border-radius: 8px; font-weight: 600; }
.btn-secondary { border: 1px solid var(--ink); border-radius: 8px; padding: .7rem 1.2rem; }

mark { background: var(--butter); color: var(--ink); padding: 0 .15em; }
```
