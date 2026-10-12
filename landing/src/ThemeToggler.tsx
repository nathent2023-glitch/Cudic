import { useCallback, useEffect, useState } from 'react';

// Animated theme toggler (Magic UI port): a circle wipes out from the
// button while the theme flips underneath. Persists in localStorage.
export default function ThemeToggler() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('cudic-theme');
      const initial = saved === 'light' ? 'light' : 'dark';
      setTheme(initial);
      document.documentElement.dataset.theme = initial;
    } catch {
      /* private mode: stay dark */
    }
  }, []);

  const toggle = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const next = theme === 'dark' ? 'light' : 'dark';
        setTheme(next);
        document.documentElement.dataset.theme = next;
        try {
          localStorage.setItem('cudic-theme', next);
        } catch {}
        return;
      }
      const next = theme === 'dark' ? 'light' : 'dark';
      const wipe = document.createElement('div');
      wipe.className = 'theme-wipe';
      const r = e.currentTarget.getBoundingClientRect();
      const d = Math.hypot(window.innerWidth, window.innerHeight) * 2;
      wipe.style.cssText = `left:${r.left + r.width / 2}px;top:${r.top + r.height / 2}px;width:${d}px;height:${d}px;background:${next === 'light' ? '#f4f1ea' : '#0d0e10'}`;
      document.body.appendChild(wipe);
      requestAnimationFrame(() => {
        wipe.classList.add('run');
        setTimeout(() => {
          setTheme(next);
          document.documentElement.dataset.theme = next;
          try {
            localStorage.setItem('cudic-theme', next);
          } catch {}
        }, 220);
        setTimeout(() => wipe.remove(), 650);
      });
    },
    [theme],
  );

  return (
    <button
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-cream transition-colors hover:border-signal"
    >
      {theme === 'dark' ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      )}
    </button>
  );
}
