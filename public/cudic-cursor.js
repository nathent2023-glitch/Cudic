(() => {
  if (!matchMedia('(pointer:fine)').matches) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const COLORS = ['#b8f23a','#3f7cff','#f7f5ec','#9fd0ff'], PX = 3;
  const cv = document.createElement('canvas');
  Object.assign(cv.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '2147483647' });
  document.body.appendChild(cv);
  const ctx = cv.getContext('2d');
  const fit = () => { cv.width = innerWidth; cv.height = innerHeight; };
  fit(); addEventListener('resize', fit);
  const P = []; let running = false;
  function burst(x, y, n) {
    n = reduce ? 3 : n;
    if (P.length > 180) P.splice(0, P.length - 180);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, s = 1 + Math.random() * 3;
      P.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 2, l: 20 + (Math.random() * 14 | 0), c: COLORS[i % 4], z: Math.random() < .35 ? 2 : 1 });
    }
    if (!running) { running = true; requestAnimationFrame(tick); }
  }
  function tick() {
    if (document.hidden) { running = false; return; }
    ctx.clearRect(0, 0, cv.width, cv.height);
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i]; p.vy += .2; p.x += p.vx; p.y += p.vy;
      if (--p.l <= 0) { P.splice(i, 1); continue; }
      ctx.fillStyle = p.c; ctx.fillRect(Math.round(p.x / PX) * PX, Math.round(p.y / PX) * PX, PX * p.z, PX * p.z);
    }
    P.length ? requestAnimationFrame(tick) : (running = false);
  }
  addEventListener('pointerdown', e => {
    const hit = e.target.closest('a,button,[role=button],summary,input,textarea,.card,.feat,.px-stage,.doodle');
    burst(e.clientX, e.clientY, hit ? 16 : 6);
  }, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && P.length && !running) { running = true; requestAnimationFrame(tick); }
  });

  // trailing buddy (desktop only, not reduced motion)
  if (!reduce) {
    const buddy = document.createElement('img');
    buddy.src = '/cudic-assets/cursors/pixel/cream/png/default.png';
    Object.assign(buddy.style, { position: 'fixed', left: '0', top: '0', width: '32px', height: '32px', imageRendering: 'pixelated', pointerEvents: 'none', zIndex: '2147483646', display: 'none' });
    document.body.appendChild(buddy);
    let bx = 0, by = 0, btx = 0, bty = 0, buddyRunning = false, buddyRaf;
    function buddyLoop() {
      bx += (btx - bx) * 0.16; by += (bty - by) * 0.16;
      buddy.style.transform = 'translate(' + Math.round(bx + 2) + 'px, ' + Math.round(by + 2) + 'px)';
      if (buddyRunning) buddyRaf = requestAnimationFrame(buddyLoop);
    }
    const stage = document.getElementById('pxStage');
    const showBuddy = () => { buddy.style.display = ''; if (!buddyRunning) { buddyRunning = true; requestAnimationFrame(buddyLoop); } };
    const hideBuddy = () => { buddy.style.display = 'none'; buddyRunning = false; if (buddyRaf) cancelAnimationFrame(buddyRaf); };
    addEventListener('pointermove', e => {
      btx = e.clientX; bty = e.clientY;
      if (stage && stage.contains(e.target)) showBuddy(); else hideBuddy();
    });
    if (stage) stage.addEventListener('pointerleave', hideBuddy);
    document.addEventListener('visibilitychange', () => { if (document.hidden) hideBuddy(); });
  }
})();
