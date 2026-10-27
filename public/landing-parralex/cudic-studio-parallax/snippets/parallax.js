// Vanilla parallax for any element tree that has [data-depth] children.
export function parallax(root, { strength = 24, ease = 0.08, snap = true, idle = true } = {}) {
  const layers = [...root.querySelectorAll('[data-depth]')];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let tx = 0, ty = 0, cx = 0, cy = 0, last = -9999, raf;
  const clamp = v => Math.max(-1, Math.min(1, v));
  const move = e => { const r = root.getBoundingClientRect();
    tx = clamp(((e.clientX - r.left) / r.width - 0.5) * 2); ty = clamp(((e.clientY - r.top) / r.height - 0.5) * 2); last = performance.now(); };
  const tilt = e => { if (e.gamma == null) return; tx = clamp(e.gamma / 25); ty = clamp((e.beta - 45) / 25); last = performance.now(); };
  addEventListener('pointermove', move); addEventListener('deviceorientation', tilt);
  (function loop(t) {
    if (idle && t - last > 3000) { tx = Math.sin(t / 2200) * 0.55; ty = Math.cos(t / 2700) * 0.35; }
    cx += (tx - cx) * ease; cy += (ty - cy) * ease;
    const u = root.clientWidth / 320;                       // screen px per art pixel
    for (const l of layers) {
      const d = +l.dataset.depth; let x = -cx * strength * d, y = -cy * strength * d;
      if (snap) { x = Math.round(x); y = Math.round(y); }   // move in whole art pixels
      l.style.transform = `translate(${x * u}px, ${y * u}px) scale(1)`;
    }
    if (!reduce) raf = requestAnimationFrame(loop);
  })(0);
  return () => { cancelAnimationFrame(raf); removeEventListener('pointermove', move); removeEventListener('deviceorientation', tilt); };
}
