import { createElement, StrictMode } from 'react';
import type { ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import './islands.css';
import NewMenu from './islands/new-menu';

// ── Island registry: name -> component ───────────────────────────
// New island: add the import + entry here, rebuild (npm run build),
// drop <div data-island="name"> + the islands.js script tag in the page.
const REGISTRY: Record<string, ComponentType> = {
  'new-menu': NewMenu,
};

function mountAll() {
  // Mount immediately: parser-inserted scripts at end of body run while
  // readyState is still 'loading', but every container above this script
  // already exists. Deferring to DOMContentLoaded would run AFTER the
  // page's inline scripts — classic code grabbing #newDropBtn by id would
  // throw on the missing node and kill the rest of its own script block.
  document.querySelectorAll('[data-island]:not([data-island-mounted])').forEach((el) => {
    const name = el.getAttribute('data-island') || '';
    const Comp = REGISTRY[name];
    if (!Comp) return;
    try {
      el.setAttribute('data-island-mounted', '1');
      createRoot(el).render(createElement(StrictMode, null, createElement(Comp)));
    } catch (e) {
      console.error('[islands] mount failed:', name, e);
    }
  });
}

mountAll();
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountAll);
}
