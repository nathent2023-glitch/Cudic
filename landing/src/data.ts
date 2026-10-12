// Static content for the landing page. Sentence case, active voice,
// buttons state the outcome. No fake numbers, no hype badges.

const RAW = 'https://raw.githubusercontent.com/shorepine/kenney/main/3d';

export interface AmbientModel {
  /** Full GLB url; streams from upstream at view time, never downloaded. */
  url: string;
  /** Loader resource path (sibling Textures/ dir). */
  base: string;
  /** World position; camera scrolls past them down the page. */
  at: [number, number, number];
  scale: number;
  spin: number;
}

// One per pack. Nothing here is rendered as text anywhere — these are
// silent decoration. Order spreads them down the page.
export const AMBIENT_MODELS: AmbientModel[] = [
  { url: `${RAW}/blocky-characters/character-a.glb`, base: `${RAW}/blocky-characters/`, at: [3.1, 1.5, -2], scale: 1.1, spin: 0.5 },
  { url: `${RAW}/car/sedan.glb`, base: `${RAW}/car/`, at: [-3.2, -2.5, -3], scale: 1.0, spin: 0.7 },
  { url: `${RAW}/cube-pets/animal-penguin.glb`, base: `${RAW}/cube-pets/`, at: [3.3, -6.5, -2.5], scale: 1.2, spin: 0.9 },
  { url: `${RAW}/blaster/blaster-a.glb`, base: `${RAW}/blaster/`, at: [-3.1, -10.5, -2], scale: 1.3, spin: 1.1 },
  { url: `${RAW}/city-commercial/building-d.glb`, base: `${RAW}/city-commercial/`, at: [3.0, -15, -4], scale: 1.4, spin: 0.4 },
  { url: `${RAW}/factory/cog-a.glb`, base: `${RAW}/factory/`, at: [-3.2, -19, -2.5], scale: 1.5, spin: 1.4 },
  { url: `${RAW}/coaster/coaster-flume-looping.glb`, base: `${RAW}/coaster/`, at: [3.2, -23.5, -3.5], scale: 1.0, spin: 0.6 },
  { url: `${RAW}/food/burger.glb`, base: `${RAW}/food/`, at: [-3.3, -27.5, -2], scale: 1.4, spin: 1.0 },
  { url: `${RAW}/city-roads/construction-cone.glb`, base: `${RAW}/city-roads/`, at: [3.1, -31.5, -2.5], scale: 1.6, spin: 0.8 },
  { url: `${RAW}/fantasy-town/lantern.glb`, base: `${RAW}/fantasy-town/`, at: [-3.0, -35.5, -3], scale: 1.3, spin: 0.7 },
];

export const KENNEY = '/assets/kenney';

export interface FloatSprite {
  src: string;
  className: string;
  speed: number;
  spin: number;
  delay: string;
}

export const HERO_SPRITES: FloatSprite[] = [
  { src: `${KENNEY}/game-icons/white/gamepad.png`, className: 'left-[6%] top-[22%] w-14 opacity-80', speed: 0.35, spin: 40, delay: '0s' },
  { src: `${KENNEY}/game-icons/white/star.png`, className: 'right-[8%] top-[20%] w-10 opacity-70', speed: 0.55, spin: -60, delay: '1.2s' },
  { src: `${KENNEY}/game-icons/white/trophy.png`, className: 'left-[10%] bottom-[24%] w-12 opacity-70', speed: 0.45, spin: 30, delay: '0.6s' },
  { src: `${KENNEY}/emotes/emote_heart.png`, className: 'right-[11%] bottom-[28%] w-11 opacity-80', speed: 0.65, spin: -40, delay: '2s' },
  { src: `${KENNEY}/game-icons/white/gear.png`, className: 'left-[22%] top-[12%] w-9 opacity-60', speed: 0.8, spin: 50, delay: '1.6s' },
  { src: `${KENNEY}/game-icons-expansion/white/coin.png`, className: 'right-[24%] top-[64%] w-8 opacity-60', speed: 0.5, spin: -30, delay: '0.3s' },
  { src: `${KENNEY}/emotes/emote_star.png`, className: 'left-[30%] bottom-[12%] w-9 opacity-50', speed: 0.7, spin: 70, delay: '2.4s' },
  { src: `${KENNEY}/game-icons/white/musicOn.png`, className: 'right-[30%] top-[10%] w-9 opacity-50', speed: 0.6, spin: -50, delay: '0.9s' },
];

export const MARQUEE_WORDS = [
  'Studio',
  'Publish in one move',
  'Embed anywhere',
  'Cloud saves',
  'Chat lobbies',
  'Theme packs',
  'Scratch import',
  'Cudic AI',
  'Play instantly',
];

export interface BentoCell {
  icon: string;
  title: string;
  body: string;
  span: string;
}

export const BENTO: BentoCell[] = [
  {
    icon: `${KENNEY}/game-icons/white/wrench.png`,
    title: 'A workbench, not a toy editor',
    body: 'File tree, tabbed editor, live preview and console side by side. Plain HTML, CSS and JS — or a Python file, or an npm package — run it right there.',
    span: 'md:col-span-2',
  },
  {
    icon: `${KENNEY}/game-icons/white/export.png`,
    title: 'Publish in one move',
    body: 'One click gives your game a page, a thumbnail and a comment thread.',
    span: '',
  },
  {
    icon: `${KENNEY}/game-icons/white/share1.png`,
    title: 'Embed anywhere',
    body: 'Every published game ships fixed and responsive iframe snippets. Click to play, local saves, no sign-in wall.',
    span: '',
  },
  {
    icon: `${KENNEY}/game-icons/white/save.png`,
    title: 'Progress follows the account',
    body: 'Cloud saves carry bests and full game state across devices.',
    span: '',
  },
  {
    icon: `${KENNEY}/game-icons/white/multiplayer.png`,
    title: 'Chat while you play',
    body: 'Persistent lobbies and servers with channels, DMs and rules gates.',
    span: '',
  },
  {
    icon: `${KENNEY}/emotes/emote_idea.png`,
    title: 'Cudic AI in the sidebar',
    body: 'Fifty-plus providers, ghost autocomplete, and file tools that read and save for you.',
    span: 'md:col-span-2',
  },
];

export interface Shot {
  src: string;
  title: string;
  body: string;
}

export const SHOTS: Shot[] = [
  {
    src: '/shots/studio.png',
    title: 'The workbench',
    body: 'Files, editor, preview and console sharing one tab.',
  },
  {
    src: '/shots/games.png',
    title: 'The gallery',
    body: 'Published games with pages, threads and fork buttons.',
  },
  {
    src: '/shots/themes.png',
    title: 'The theme store',
    body: 'Packs that reskin the rail, scenes and icons at once.',
  },
  {
    src: '/shots/studio-preview.png',
    title: 'The preview',
    body: 'Exactly what players see, before anything ships.',
  },
];

export interface Commit {
  sha: string;
  title: string;
  desc: string;
  date: string;
}

// Baked in at prerender time; the live fetch replaces these in the browser.
export const COMMITS_FALLBACK: Commit[] = [
  { sha: '28567fc', title: 'feat: embeddable games, Brevo HTTPS mail leg, changelog catch-up', desc: '', date: 'Oct 11' },
  { sha: '15327eb', title: 'feat: magic email codes replace link flow, soft-gated publishing and chat', desc: '', date: 'Oct 11' },
  { sha: '9c44757', title: 'feat: Satoshi/Epilogue type, squircle corners, docs remake, seat false-positive fix', desc: '', date: 'Oct 9' },
  { sha: 'fb142d3', title: 'fix: correct AdSense pub ID, add account meta tag', desc: '', date: 'Oct 8' },
  { sha: 'f1bc10d', title: 'feat: AdSense verification snippet, ads.txt, privacy page', desc: '', date: 'Oct 8' },
  { sha: '36f2581', title: 'docs: add CHANGELOG.md with versioned release history', desc: '', date: 'Oct 7' },
];
