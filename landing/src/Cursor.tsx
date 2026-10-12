import { useEffect } from 'react';

// Magic UI smooth-cursor, hand-ported to vanilla rAF springs:
// a fast dot on the pointer plus a slow ring chasing it.
export default function Cursor() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (window.matchMedia('(pointer: coarse)').matches) return;
    const dot = document.getElementById('cursor-dot');
    const ring = document.getElementById('cursor-ring');
    if (!dot || !ring) return;
    dot.hidden = false;
    ring.hidden = false;
    document.body.classList.add('has-cursor');

    let mx = -100;
    let my = -100;
    let rx = -100;
    let ry = -100;
    let raf = 0;
    const onMove = (e: MouseEvent) => {
      mx = e.clientX;
      my = e.clientY;
      const t = (e.target as HTMLElement | null)?.closest?.('a,button,[data-cursor]');
      ring.classList.toggle('grow', !!t);
    };
    const step = () => {
      // ponytail: two-rate lerp reads as spring physics for a cursor;
      // a real spring integrator buys nothing visible here.
      rx += (mx - rx) * 0.16;
      ry += (my - ry) * 0.16;
      dot.style.transform = `translate(${mx}px,${my}px) translate(-50%,-50%)`;
      ring.style.transform = `translate(${rx}px,${ry}px) translate(-50%,-50%)`;
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', onMove);
      cancelAnimationFrame(raf);
      document.body.classList.remove('has-cursor');
    };
  }, []);

  return (
    <>
      <div id="cursor-dot" className="cursor-dot" hidden aria-hidden="true" />
      <div id="cursor-ring" className="cursor-ring" hidden aria-hidden="true" />
    </>
  );
}
