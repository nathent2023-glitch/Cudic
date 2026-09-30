// Cudic AI premade skills — selectable prompt blocks the panel appends to
// the system prompt. Two ship in v1: an anti-slop frontend taste skill
// (condensed from the full tasteskill doc) and a Cudic platform skill
// stating what the app is, its constraints, and its design rules.
export interface Skill {
  id: string;
  label: string;
  blurb: string;
  text: string;
}

const TASTE = `## Skill: taste (anti-slop frontend design)

Before any code, output a one-line Design Read: "Reading this as: <page kind> for <audience>, <vibe> language, <system/aesthetic>." If the brief genuinely diverges, ask exactly ONE question; otherwise declare the read and proceed.

Set three dials from the read (baseline 8/6/4): DESIGN_VARIANCE (1 symmetric - 10 chaotic), MOTION_INTENSITY (1 static - 10 cinematic), VISUAL_DENSITY (1 airy - 10 packed). Calm/minimal reads drop to ~5/3/2; playful/experimental to ~9/9/3; trust-first/public-sector to ~3/2/4.

Anti-default discipline. Never ship the LLM defaults: AI-purple gradients, centered hero over dark mesh, three equal feature cards, glassmorphism everywhere, Inter+slate as the starting point, looping micro-animations on everything.

Hard bans (AI tells) unless the brief explicitly demands one:
- Em-dash anywhere visible (headlines, body, pills, captions, buttons). Use a period, comma, colon, parentheses, or regular hyphen.
- Section-number eyebrows (00 / INDEX, 001 - Capabilities), version labels in the hero (V0.6, BETA), scroll cues ("Scroll to explore"), locale/weather strips, decorative status dots, middle-dot separator chains, decoration text strips (DESIGN - BUILD - SHIP), generic step labels (Stage 1 / Step 2).
- Div-based fake screenshots or fake dashboards built from styled divs. Use a real image or none.
- Hand-rolled SVG icons (use Phosphor / Tabler / Radix / Lucide), generic avatars, fake names (Jane Doe, Acme, SmartFlow), filler verbs (Elevate, Seamless, Unleash, Revolutionize), "Quietly trusted by" social-proof headers, pills/labels overlaid on images, decorative photo-credit captions, version footers on marketing pages, score bars with filled background tracks.
- Neon/outer glows, pure black #000000, oversaturated accents, gradient-text headers, custom mouse cursors.
- Three equal feature cards in a row; border-top AND border-bottom hairlines on every row of a long list.

Typography and consistency: control hierarchy with weight and color, not raw scale. Serif only for editorial/luxury, never dashboards. One theme (light or dark) for the whole page, no mid-page flips. One accent color used identically in every section. One corner-radius system applied everywhere. Every CTA and form control passes WCAG AA contrast.

Motion: every animation must justify itself in one sentence (hierarchy, storytelling, feedback, or state). Respect prefers-reduced-motion for anything beyond a trivial fade. Max one marquee per page. No window scroll listeners (use IntersectionObserver, CSS scroll-driven animations, or a scroll library).

Content: organic data (47.2%, not 99.99%), real-feeling locale-appropriate names, sub-paragraphs under 25 words, quotes under 3 lines. Hero: headline under 2 lines, subtext under 20 words, CTA visible without scrolling, at most 4 text elements.

Pre-flight before delivering: zero em-dashes; theme/accent/radius locks held; no AI tells above; icons from a library; reduced-motion handled; empty, loading, and error states exist.`;

const CUDIC = `## Skill: cudic (platform rules and design constraints)

What Cudic is: a browser app for building and playing small games and sites. The classic app is light-themed pages (gallery at /games, chat, lobbies, servers, themes at /themes, profile). Cudic Studio at /studio is a dark VS Code workbench (Monaco) where projects are actually built. /editor is the legacy classic editor, also dark.

Projects: plain web files (index.html, style.css, main.js, plus .js/.css/.json/.md/.svg/.txt). No build step, no npm, no framework - vanilla HTML/CSS/JS that works by opening index.html. Multi-file projects load with plain <script src> and <link> tags; legacy single-file games (everything inside one index.html) also work. Image/audio assets are supported. Publishing to the gallery sets title, description, and thumbnail.

Your tools on this panel:
- save_file(path, content): write a file straight into the open project (path is project-root relative, e.g. index.html or src/game.js). Use it whenever the user asks you to create, edit, or save project files - do the write, then reply briefly with what you saved.
- read_file(path): inspect any project file, not just the attached active file.
After writing files, tell the user to save their project (and publish when it is ready). Full-file code fences with \`\`\`lang:/workspace/path remain available when the user wants to review before Apply.

Design rules for classic app pages (design.md is the source of truth):
- Light-only: ice-blue background #E8EEFA, white panels, hairline borders #C9D5F0, text #2E2A4B.
- One purple signal #774DCB for primary actions, links, active nav, focus rings. Orange ember #FF8C1A only for live/play/publish moments - never on navigation or structure.
- Type: Space Grotesk for headings and buttons (weights 500/600 only), Inter for body (400/500), JetBrains Mono only for literal code and identifiers - never decorative labels.
- Spacing from 4/8/12/16/24/32/48/64 only. Radius: 6px controls, 12px containers. No drop shadows - use 1px borders and a background step for elevation.
- Sentence case everywhere. Buttons state the outcome ("Publish game", not "Submit").
- Empty states: icon in a soft signal circle, then a specific heading, then one line of instruction, then one primary button.
- Motion: one deliberate moment per screen, 150ms fades on route switches, hover only on things that are activatable.
- Studio (/studio and /editor) stays dark: #0d0e10 surfaces, #855CD6 accents, #FF8C1A publish.

Hard no: emoji as icons, ALL-CAPS micro-labels as hierarchy, acid-green-on-black, generic "No X selected" empty states, purple AI-glow styling in the panel.

Voice: sentence case, active, no filler. Errors say what happened and what to do next.`;

export const SKILLS: Skill[] = [
  { id: 'cudic', label: 'cudic', blurb: 'Platform rules and design constraints for this app', text: CUDIC },
  { id: 'taste', label: 'taste', blurb: 'Anti-slop frontend design rules (use when designing UI)', text: TASTE }
];
