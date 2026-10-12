import { hydrateRoot } from 'react-dom/client';
import App from './App';
import './tokens.css';
import type { Commit } from './data';
import { COMMITS_FALLBACK } from './data';

declare global {
  interface Window {
    __COMMITS__?: Commit[];
  }
}

function forceVisible() {
  // Last resort: if anything below throws, content must still show.
  document.querySelectorAll('[data-hero-title],[data-hero-fade]').forEach((el) => el.classList.add('go'));
  document.querySelectorAll('[data-rv],[data-clip],[data-draw]').forEach((el) => el.classList.add('in'));
}

try {
  const initial: Commit[] =
    Array.isArray(window.__COMMITS__) && window.__COMMITS__.length
      ? window.__COMMITS__
      : COMMITS_FALLBACK;

  hydrateRoot(document.getElementById('root')!, <App initialCommits={initial} />);

  requestAnimationFrame(() => {
    document.querySelector('[data-hero-title]')?.classList.add('go');
    document.querySelectorAll('[data-hero-fade]').forEach((el) => el.classList.add('go'));
  });

  // fx loads after first paint so a failure here can't blank the hero.
  void import('./fx').then(({ initFx }) => initFx());
} catch {
  forceVisible();
}
