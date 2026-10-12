import { useEffect, useState } from 'react';
import Cursor from './Cursor';
import Hero3D from './Hero3D';
import ThemeToggler from './ThemeToggler';
import AmbientField from './AmbientField';
import { BENTO, COMMITS_FALLBACK, HERO_SPRITES, MARQUEE_WORDS, SHOTS, type Commit } from './data';

function Commits({ initial }: { initial: Commit[] }) {
  const [commits, setCommits] = useState<Commit[]>(initial);
  useEffect(() => {
    let dead = false;
    fetch('https://api.github.com/repos/nathent2023-glitch/Cudic/commits?per_page=6')
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Array<{ sha: string; commit: { message: string; author: { date: string } } }>) => {
        if (dead || !Array.isArray(data) || !data.length) return;
        setCommits(
          data.map((c) => {
            const lines = c.commit.message.split('\n');
            const d = new Date(c.commit.author.date);
            return {
              sha: c.sha.substring(0, 7),
              title: lines[0],
              desc: lines.slice(1).join(' ').trim().substring(0, 140),
              date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            };
          }),
        );
      })
      .catch(() => {});
    return () => {
      dead = true;
    };
  }, []);

  return (
    <div className="mt-12 flex flex-col gap-3">
      {commits.map((c) => (
        <a
          key={c.sha}
          className="feat-card flex items-start gap-3 p-4 pl-5 no-underline"
          href={`https://github.com/nathent2023-glitch/Cudic/commit/${c.sha}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className="shrink-0 font-mono text-xs text-muted">#{c.sha}</span>
          <span className="flex-1">
            <span className="block font-display text-base font-semibold">{c.title}</span>
            {c.desc ? <span className="block text-sm text-stone">{c.desc}</span> : null}
            <span className="mt-1 block text-xs text-muted">{c.date}</span>
          </span>
        </a>
      ))}
    </div>
  );
}

function MarqueeRow({ words }: { words: string[] }) {
  const row = [...words, ...words];
  return (
    <div className="marquee-track items-center gap-10 pr-10">
      {row.map((w, i) => (
        <span key={i} className="flex items-center gap-10 whitespace-nowrap font-display text-lg font-semibold text-muted">
          {w}
          <img src="/assets/kenney/emotes/emote_star.png" alt="" aria-hidden="true" className="h-5 w-5 opacity-50" />
        </span>
      ))}
    </div>
  );
}

export default function App({ initialCommits = COMMITS_FALLBACK }: { initialCommits?: Commit[] }) {
  return (
    <div className="relative min-h-screen bg-paper font-body text-ink">
      <div id="scroll-progress" className="fixed inset-x-0 top-0 z-[60] h-[3px] origin-left scale-x-0 bg-signal" />
      <div className="grid-bg" aria-hidden="true" />
      <AmbientField />
      <Cursor />

      <header id="landing-nav" className="fixed inset-x-0 top-0 z-50 border-b border-line bg-paper/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3.5">
          <a href="/" className="flex items-center gap-2 font-display text-xl font-semibold" aria-label="Cudic home">
            <img src="/cudic_sfsvg.svg" alt="" width="22" height="22" />
            <span>cudic</span>
          </a>
          <nav className="hidden gap-6 md:flex" aria-label="Primary">
            {[
              ['Gallery', '/games'],
              ['Themes', '/themes'],
              ['Docs', '/docs'],
              ['Chat', '/chat'],
              ['Studio', '/studio'],
            ].map(([label, href]) => (
              <a key={href} href={href} className="text-sm font-medium text-ink/90 hover:text-ink">
                {label}
              </a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-4">
            <ThemeToggler />
            <a href="/login" className="hidden text-sm font-medium text-muted hover:text-ink sm:inline">
              Sign in
            </a>
            <a href="/studio" className="btn btn-primary ihb" data-magnetic>
              <span className="ihb-label">Open Studio</span>
              <span className="ihb-arrow" aria-hidden="true">&nbsp;→</span>
            </a>
          </div>
        </div>
      </header>

      <main className="relative z-10">
        {/* ── Hero ── */}
        <section id="top" className="relative overflow-hidden pt-36 pb-28 text-center">
          <Hero3D />
          {HERO_SPRITES.map((s, i) => (
            <img
              key={i}
              src={s.src}
              alt=""
              aria-hidden="true"
              data-speed={s.speed}
              data-spin={s.spin}
              style={{ animationDelay: s.delay }}
              className={`floaty pointer-events-none absolute hidden sm:block ${s.className}`}
            />
          ))}
          <div className="relative mx-auto max-w-4xl px-6" data-hero-out>
            <p data-hero-fade className="mb-5 font-mono text-xs uppercase tracking-[0.2em] text-signal">
              Browser studio for small games
            </p>
            <h1 data-hero-title className="mx-auto max-w-[16ch] font-display text-5xl font-semibold leading-[1.02] tracking-tight sm:text-7xl">
              Make a game in the tab you're already in.
            </h1>
            <p data-hero-fade className="mx-auto mt-6 max-w-[56ch] text-lg text-stone">
              Edit files, preview live, publish, and hand someone a link they can
              play instantly. No install, no setup, no build step on your end.
            </p>
            <div data-hero-fade className="backlight mt-9 flex flex-wrap justify-center gap-3.5">
              <a href="/studio" className="btn btn-primary ihb" data-magnetic>
                <span className="ihb-label">Start building</span>
                <span className="ihb-arrow" aria-hidden="true">&nbsp;→</span>
              </a>
              <a href="/games" className="btn btn-secondary ihb" data-magnetic>
                <span className="ihb-label">Play something</span>
                <span className="ihb-arrow" aria-hidden="true">&nbsp;→</span>
              </a>
            </div>
            <div data-hero-fade className="mt-12 flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
              {[
                ['674', 'CC0 icons bundled'],
                ['53', 'AI providers'],
                ['4', 'ways to run code'],
              ].map(([n, label]) => (
                <div key={label} className="text-center">
                  <div data-count={n} className="font-display text-3xl font-semibold text-ink">
                    {n}
                  </div>
                  <div className="text-sm text-stone">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Velocity marquee ── */}
        <div data-velocity className="marquee overflow-hidden border-y border-line bg-cream/60 py-4" aria-hidden="true">
          <MarqueeRow words={MARQUEE_WORDS} />
        </div>

        {/* ── Bento features ── */}
        <section className="mx-auto max-w-6xl px-6 py-28">
          <div className="max-w-2xl">
            <h2 data-clip className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">
              One tab does the whole job.
            </h2>
            <p data-rv className="mt-4 max-w-[60ch] text-stone">
              Write it, run it, publish it and talk about it without leaving the browser.
            </p>
          </div>
          <div className="mt-12 grid gap-5 md:grid-cols-3" data-stagger>
            {BENTO.map((c) => (
              <article key={c.title} data-rv data-tilt className={`feat-card beam-frame p-7 ${c.span}`}>
                <img src={c.icon} alt="" aria-hidden="true" className="h-9 w-9 opacity-90" />
                <h3 className="mt-4 font-display text-xl font-semibold">{c.title}</h3>
                <p className="mt-2 text-[0.97rem] text-ink/90">{c.body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ── Gallery ── */}
        <section className="border-y border-line bg-cream/40">
          <div className="mx-auto max-w-6xl px-6 py-24">
            <div className="max-w-2xl">
              <h2 data-clip className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">
                Watch it come together.
              </h2>
              <p data-rv className="mt-4 text-stone">
                The workbench, the gallery, the theme store and the docs.
              </p>
            </div>
            <div className="mt-12 grid gap-6 md:grid-cols-2" data-stagger>
              {SHOTS.map((s) => (
                <figure key={s.src} className="beam-frame overflow-hidden rounded-xl border border-line bg-paper" data-beamboost data-rv>
                  <span className="beam" aria-hidden="true" />
                  <div className="overflow-hidden">
                    <img src={s.src} alt="" loading="lazy" className="parallax-img block h-auto w-full scale-110" />
                  </div>
                  <figcaption className="p-5">
                    <div className="font-display text-lg font-semibold">{s.title}</div>
                    <div className="mt-1 text-sm text-stone">{s.body}</div>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>

        {/* ── Drifting words ── */}
        <div className="overflow-hidden py-10" aria-hidden="true">
          <div data-drift="0.3" className="whitespace-nowrap font-display text-[11vw] font-bold leading-none text-ink/[0.05]">
            MAKE — PLAY — SHARE — MAKE — PLAY — SHARE
          </div>
        </div>

        <hr data-draw className="mx-auto max-w-6xl border-line" />

        {/* ── Live updates ── */}
        <section className="mx-auto max-w-6xl px-6 py-24">
          <div className="max-w-2xl">
            <h2 data-clip className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">
              Shipped lately
            </h2>
            <p data-rv className="mt-4 text-stone">
              Fresh out of the repo — open any card to read the commit.
            </p>
          </div>
          <Commits initial={initialCommits} />
        </section>

        {/* ── Finale ── */}
        <section className="px-6 py-32 text-center">
          <h2 data-clip className="mx-auto max-w-[18ch] font-display text-4xl font-semibold sm:text-6xl">
            Open a tab. Make something.
          </h2>
          <p data-rv className="mx-auto mt-5 max-w-[52ch] text-stone">
            Your first game is an afternoon, not a project plan.
          </p>
          <div data-rv className="backlight mt-9 flex flex-wrap justify-center gap-3.5">
            <a href="/studio" className="btn btn-primary ihb" data-magnetic>
              <span className="ihb-label">Open Studio</span>
              <span className="ihb-arrow" aria-hidden="true">&nbsp;→</span>
            </a>
            <a href="/games" className="btn btn-secondary ihb" data-magnetic>
              <span className="ihb-label">Browse the gallery</span>
              <span className="ihb-arrow" aria-hidden="true">&nbsp;→</span>
            </a>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-5 px-6 py-10">
          <div data-foot className="flex items-center gap-2 font-display text-lg font-semibold">
            <img src="/cudic_sfsvg.svg" alt="" width="20" height="20" />
            <span>cudic</span>
          </div>
          <nav data-foot className="flex flex-wrap gap-6" aria-label="Footer">
            {[
              ['Gallery', '/games'],
              ['Themes', '/themes'],
              ['Docs', '/docs'],
              ['Chat', '/chat'],
              ['Studio', '/studio'],
              ['Privacy', '/privacy'],
            ].map(([label, href]) => (
              <a key={href} href={href} className="text-sm text-ink/90 hover:text-ink">
                {label}
              </a>
            ))}
          </nav>
          <p data-foot className="text-sm text-stone">
            © 2026 Cudic. All rights reserved.
          </p>
        </div>
      </footer>

      <button
        id="to-top"
        aria-label="Back to top"
        className="fixed bottom-6 right-6 z-50 flex h-11 w-11 items-center justify-center rounded-full bg-ember font-display text-xl font-bold text-paper shadow-lg"
      >
        ↑
      </button>
    </div>
  );
}
