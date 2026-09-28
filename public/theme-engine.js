// Cudic theme packs — static-file v1. Packs live in /packs/<slug>/manifest.json.
// (/packs, not /themes — a /themes directory shadows the /themes rewrite on Vercel.)
// A pack is pure JSON: colors, fonts, wallpaper, art, icons, motion. Nothing in
// a pack ever executes — scenes/animations ship here and packs reference by id.
(function () {
  if (window.CudicTheme) return;
  var PACK_KEY = 'cudic-pack', MANIFEST_KEY = 'cudic-pack-manifest';
  var root = document.documentElement;
  var reduced = function () {
    return (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) ||
      root.classList.contains('reduce-motion');
  };
  var state = { slug: null, manifest: null, bgEl: null, sceneStop: null };

  var FONTS = {
    'Inter': null, 'Space Grotesk': null,
    'Sora': 'https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700&display=swap',
    'Manrope': 'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;700&display=swap',
    'Outfit': 'https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&display=swap',
    'DM Sans': 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap',
    'JetBrains Mono': null
  };
  function ensureFont(name) {
    var url = FONTS[name];
    if (!url || document.querySelector('link[data-packfont="' + name + '"]')) return;
    var l = document.createElement('link');
    l.rel = 'stylesheet';
    l.setAttribute('data-packfont', name);
    l.href = url;
    document.head.appendChild(l);
  }
  function hexRgb(h) {
    h = String(h || '#000000').replace('#', '');
    if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
    var n = parseInt(h, 16) || 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function shade(hex, amt) {
    var c = hexRgb(hex).map(function (v) { return Math.max(0, Math.min(255, v + amt)); });
    return '#' + c.map(function (v) { return v.toString(16).padStart(2, '0'); }).join('');
  }

  function applyVars(m) {
    var r = root.style, c = m.colors || {};
    var set = function (k, v) { if (v) r.setProperty(k, v); };
    set('--ink', c.ink); set('--panel', c.panel); set('--panel-raised', c.raised);
    set('--line', c.line); set('--text-primary', c.tp); set('--text-secondary', c.ts);
    set('--text-tertiary', c.tt);
    if (c.signal) {
      set('--signal', c.signal);
      set('--signal-hover', shade(c.signal, -22));
      var s = hexRgb(c.signal);
      set('--signal-tint', 'rgba(' + s[0] + ',' + s[1] + ',' + s[2] + ',0.14)');
    }
    if (m.radius != null) set('--radius-lg', m.radius + 'px');
    if (m.fonts) {
      if (m.fonts.head) { ensureFont(m.fonts.head); set('--font-head', "'" + m.fonts.head + "',sans-serif"); }
      if (m.fonts.body) { ensureFont(m.fonts.body); set('--font-body', "'" + m.fonts.body + "',sans-serif"); }
    }
    if (m.wordmark && (m.wordmark.type === 'svg' || m.wordmark.type === 'png')) {
      document.querySelectorAll('.brand-word,.brand').forEach(function (el) {
        el.innerHTML = '';
        var img = document.createElement('img');
        img.src = m.wordmark.src; img.alt = 'cudic';
        img.style.height = '1.5em'; img.style.verticalAlign = 'middle';
        el.appendChild(img);
      });
    }
    root.dataset.motion = (m.motion && m.motion.preset) || 'calm';
  }
  function clearVars() {
    ['--ink', '--panel', '--panel-raised', '--line', '--text-primary', '--text-secondary',
     '--text-tertiary', '--signal', '--signal-hover', '--signal-tint', '--radius-lg',
     '--font-head', '--font-body'].forEach(function (k) { root.style.removeProperty(k); });
    delete root.dataset.motion;
  }

  /* ── Background layer ── */
  function pageOk(m) {
    var pages = (m.background && m.background.pages) || ['all'];
    if (pages.indexOf('all') !== -1) return true;
    return pages.indexOf(document.body.getAttribute('data-page') || '') !== -1;
  }
  function teardownBg() {
    if (state.sceneStop) { try { state.sceneStop(); } catch (e) {} state.sceneStop = null; }
    if (state.bgEl) { state.bgEl.remove(); state.bgEl = null; }
    root.removeAttribute('data-pack-bg');
  }
  function buildBackground(m) {
    teardownBg();
    var bg = (m.background) || { type: 'none' };
    if (bg.type === 'none' || reduced() || !pageOk(m)) return;
    var el = document.createElement('div');
    el.id = 'packBg';
    var op = (bg.opacity != null) ? bg.opacity : 0.5;
    if (bg.type === 'image') {
      var img = document.createElement('img');
      img.src = bg.src; img.alt = '';
      img.style.opacity = op;
      el.appendChild(img);
    } else if (bg.type === 'video') {
      var v = document.createElement('video');
      v.src = bg.src; v.muted = true; v.loop = true;
      v.setAttribute('playsinline', ''); v.setAttribute('autoplay', '');
      v.style.opacity = op;
      el.appendChild(v);
      v.play().catch(function () {});
    } else if (bg.type === 'scene' && SCENES[bg.scene]) {
      var cv = document.createElement('canvas');
      el.appendChild(cv);
      el.style.opacity = op;
      state.sceneStop = SCENES[bg.scene](cv, bg.params || {});
    } else return;
    document.body.insertBefore(el, document.body.firstChild);
    state.bgEl = el;
    root.setAttribute('data-pack-bg', '1');
  }

  /* ── Canvas scenes (the only code a pack can invoke, by id + params) ── */
  function fitCanvas(cv) {
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var w = cv.clientWidth || window.innerWidth, h = cv.clientHeight || window.innerHeight;
    cv.width = Math.max(2, Math.round(w * dpr)); cv.height = Math.max(2, Math.round(h * dpr));
    return dpr;
  }
  function loop(cv, draw) {
    var raf = 0, running = true;
    var frame = function () { if (!running) return; draw(); raf = requestAnimationFrame(frame); };
    var onVis = function () {
      if (document.hidden) { running = false; cancelAnimationFrame(raf); }
      else if (!running) { running = true; frame(); }
    };
    document.addEventListener('visibilitychange', onVis);
    frame();
    return function () { running = false; cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', onVis); };
  }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  var SCENES = {
    // Anime city night: gradient sky, moon, lit-building layers, neon signs, rain.
    'city-night': function (cv, p) {
      var rain = p.rain != null ? p.rain : 120, hueA = p.hueA != null ? p.hueA : 288, hueB = p.hueB != null ? p.hueB : 190;
      var ctx = cv.getContext('2d'), static_ = document.createElement('canvas');
      var W = 0, H = 0, drops = [], flick = [];
      function build() {
        var dpr = fitCanvas(cv); W = cv.width; H = cv.height;
        static_.width = W; static_.height = H;
        var g = static_.getContext('2d');
        var sky = g.createLinearGradient(0, 0, 0, H);
        sky.addColorStop(0, '#070a18'); sky.addColorStop(0.55, '#141033'); sky.addColorStop(1, '#241243');
        g.fillStyle = sky; g.fillRect(0, 0, W, H);
        // Moon + halo
        var mx = W * 0.78, my = H * 0.2, mr = Math.min(W, H) * 0.07;
        var halo = g.createRadialGradient(mx, my, mr * 0.4, mx, my, mr * 3.2);
        halo.addColorStop(0, 'hsla(' + hueB + ',90%,80%,0.5)'); halo.addColorStop(1, 'transparent');
        g.fillStyle = halo; g.fillRect(mx - mr * 3.2, my - mr * 3.2, mr * 6.4, mr * 6.4);
        g.fillStyle = '#f4ecff'; g.beginPath(); g.arc(mx, my, mr, 0, 7); g.fill();
        g.fillStyle = 'rgba(20,16,51,0.25)'; g.beginPath(); g.arc(mx - mr * 0.3, my - mr * 0.15, mr * 0.85, 0, 7); g.fill();
        // Two building layers, far then near
        [['far', 0.42, 0.62, '#0d0b22'], ['near', 0.58, 0.9, '#080716']].forEach(function (L) {
          var y0 = H * L[1], x = 0;
          while (x < W) {
            var bw = rnd(W * 0.05, W * 0.12), bh = H * rnd(0.14, L[2] === 0.62 ? 0.3 : 0.42);
            g.fillStyle = L[3]; g.fillRect(x, H - y0 - bh + (H * L[1] - (H - y0)), bw, bh + H);
            // windows
            var cols = Math.floor(bw / (9 * dpr)), rows = Math.floor(bh / (13 * dpr));
            for (var i = 0; i < cols; i++) for (var j = 0; j < rows; j++) {
              if (Math.random() < (p.windows != null ? p.windows : 0.42)) {
                var hue = Math.random() < 0.6 ? hueB : hueA;
                g.fillStyle = 'hsla(' + Math.round(hue + rnd(-14, 14)) + ',95%,' + Math.round(rnd(55, 75)) + '%,' + rnd(0.5, 0.95).toFixed(2) + ')';
                var wx = x + 4 * dpr + i * 9 * dpr, wy = H - y0 - bh + 6 * dpr + j * 13 * dpr + (H * L[1] - (H - y0));
                g.fillRect(wx, wy, 4.5 * dpr, 6.5 * dpr);
                if (flick.length < 26 && Math.random() < 0.06) flick.push([wx, wy, 4.5 * dpr, 6.5 * dpr, Math.random() * 9]);
              }
            }
            // antenna light
            if (Math.random() < 0.4) {
              g.fillStyle = 'hsla(' + hueA + ',100%,65%,0.9)';
              g.fillRect(x + bw / 2 - dpr, H - y0 - bh + (H * L[1] - (H - y0)) - 8 * dpr, 2 * dpr, 3 * dpr);
            }
            x += bw + rnd(2, 10) * dpr;
          }
        });
        // Neon sign strips
        for (var s = 0; s < 7; s++) {
          var sx = rnd(0, W), sy = rnd(H * 0.45, H * 0.8), sw = rnd(3, 6) * dpr, sh = rnd(30, 90) * dpr;
          var hue = s % 2 ? hueA : hueB;
          g.shadowColor = 'hsl(' + hue + ',100%,60%)'; g.shadowBlur = 18 * dpr;
          g.fillStyle = 'hsl(' + hue + ',100%,62%)'; g.fillRect(sx, sy, sw, sh);
          g.shadowBlur = 0;
        }
        drops = [];
        for (var d = 0; d < rain; d++) drops.push([rnd(0, W), rnd(0, H), rnd(0.5, 1.4)]);
      }
      build();
      var onR = function () { build(); };
      window.addEventListener('resize', onR);
      var stop = loop(cv, function () {
        ctx.drawImage(static_, 0, 0);
        // rain
        ctx.strokeStyle = 'rgba(170,200,255,0.35)'; ctx.lineWidth = Math.max(1, W / 900); ctx.beginPath();
        for (var i = 0; i < drops.length; i++) {
          var d = drops[i];
          ctx.moveTo(d[0], d[1]); ctx.lineTo(d[0] - 4 * d[2], d[1] + 14 * d[2]);
          d[1] += (9 + d[2] * 9); d[0] -= 1.4 * d[2];
          if (d[1] > H) { d[1] = -20; d[0] = rnd(0, W + 40); }
        }
        ctx.stroke();
        // window flicker
        var t = performance.now() / 1000;
        for (var f = 0; f < flick.length; f++) {
          var w = flick[f];
          if (Math.sin(t * 2 + w[4] * 7) > 0.86) {
            ctx.fillStyle = 'rgba(8,8,20,0.85)';
            ctx.fillRect(w[0], w[1], w[2], w[3]);
          }
        }
      });
      return function () { stop(); window.removeEventListener('resize', onR); };
    },
    // Ember field: slow rising sparks over a dark gradient. Cheap and calm.
    'ember-field': function (cv, p) {
      var n = p.count != null ? p.count : 70, hue = p.hue != null ? p.hue : 28;
      var ctx = cv.getContext('2d'), W = 0, H = 0, parts = [];
      function build() {
        fitCanvas(cv); W = cv.width; H = cv.height; parts = [];
        for (var i = 0; i < n; i++) parts.push([rnd(0, W), rnd(0, H), rnd(0.6, 2.4), rnd(0.3, 1)]);
      }
      build();
      var onR = function () { build(); };
      window.addEventListener('resize', onR);
      var stop = loop(cv, function () {
        var g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#0a0a14'); g.addColorStop(1, '#1c0f14');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        for (var i = 0; i < parts.length; i++) {
          var q = parts[i];
          ctx.fillStyle = 'hsla(' + Math.round(hue + rnd(-8, 18)) + ',95%,60%,' + (0.25 + q[3] * 0.5).toFixed(2) + ')';
          ctx.beginPath(); ctx.arc(q[0], q[1], q[2] * (W / 1200 + 0.6), 0, 7); ctx.fill();
          q[1] -= q[3] * 1.6; q[0] += Math.sin((q[1] + i * 40) / 60) * 0.4;
          if (q[1] < -8) { q[1] = H + 8; q[0] = rnd(0, W); }
        }
      });
      return function () { stop(); window.removeEventListener('resize', onR); };
    }
  };

  /* ── Icon sets (sidebar nav; sets can override shapes per key) ── */
  var BASE_ICONS = {
    chat: '<svg viewBox="0 0 24 24"><path d="M4 5h16v11H9l-4 4V5Z"/></svg>',
    servers: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M7 8h4M7 12h10"/><circle cx="17" cy="8" r="1"/><circle cx="17" cy="12" r="1"/></svg>',
    games: '<svg viewBox="0 0 24 24"><rect x="3" y="8" width="18" height="9" rx="3"/><path d="M8 11v3M6.5 12.5h3M16 12h.01M18 14h.01"/></svg>',
    themes: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="9" cy="10" r="1.2"/><circle cx="14" cy="9" r="1.2"/><circle cx="15.5" cy="14" r="1.2"/><path d="M12 3a9 9 0 0 1 0 18c-1.5 0-2-1-1.4-2.2.7-1.4-.1-3-1.7-3H7a3.5 3.5 0 0 1-2.6-5.8A9 9 0 0 1 12 3Z"/></svg>'
  };
  var ICON_SETS = { default: { shapes: {}, glow: false }, neon: { shapes: {}, glow: true } };
  function applyIcons(setName) {
    var set = ICON_SETS[setName] || ICON_SETS.default;
    var nav = document.querySelector('nav.sidebar');
    if (!nav) return;
    nav.classList.toggle('pack-icons-neon', !!set.glow);
    nav.querySelectorAll('.sidebar-item[data-p]').forEach(function (a) {
      var key = a.getAttribute('data-p');
      var svg = (set.shapes && set.shapes[key]) || BASE_ICONS[key];
      if (!svg) return;
      var old = a.querySelector('svg');
      if (old) { var tmp = document.createElement('span'); tmp.innerHTML = svg; old.replaceWith(tmp.firstChild); }
    });
  }

  /* ── Sidebar mount (pack background + icon set live here) ── */
  function mountSidebar() {
    var nav = document.querySelector('nav.sidebar');
    if (!nav) return;
    var m = state.manifest;
    var card = nav.querySelector('.sidebar-nav-card');
    var bg = m && m.sidebar && m.sidebar.background;
    nav.classList.toggle('has-rail-bg', !!bg);
    if (card) {
      if (bg) card.style.setProperty('--rail-bg', 'url("' + bg + '")');
      else card.style.removeProperty('--rail-bg');
    }
    applyIcons(m && m.icons);
  }

  /* ── Public API ── */
  function applyPack(manifest, slug) {
    state.manifest = manifest; state.slug = slug || manifest.slug || null;
    applyVars(manifest);
    buildBackground(manifest);
    mountSidebar();
  }
  function persist(slug, manifest) {
    try {
      if (slug) {
        localStorage.setItem(PACK_KEY, slug);
        localStorage.setItem(MANIFEST_KEY, JSON.stringify(manifest));
      } else {
        localStorage.removeItem(PACK_KEY); localStorage.removeItem(MANIFEST_KEY);
      }
    } catch (e) {}
  }
  function installPack(manifest, slug) {
    persist(slug || manifest.slug, manifest);
    applyPack(manifest, slug);
  }
  function clearPack() {
    state.manifest = null; state.slug = null;
    persist(null);
    clearVars(); teardownBg(); mountSidebar();
  }
  function storedSlug() {
    try { return localStorage.getItem(PACK_KEY); } catch (e) { return null; }
  }
  async function boot() {
    var slug = storedSlug();
    if (!slug) return;
    try {
      var res = await fetch('/packs/' + encodeURIComponent(slug) + '/manifest.json', { cache: 'no-store' });
      if (!res.ok) throw 0;
      applyPack(await res.json(), slug);
    } catch (e) {
      try {
        var cached = JSON.parse(localStorage.getItem(MANIFEST_KEY) || 'null');
        if (cached) { applyPack(cached, slug); return; }
      } catch (e2) {}
      persist(null);
    }
  }

  window.addEventListener('cudic:sidebar-ready', mountSidebar);
  if (document.querySelector('nav.sidebar')) mountSidebar();
  window.CudicTheme = {
    boot: boot, applyPack: applyPack, installPack: installPack, clearPack: clearPack,
    mountSidebar: mountSidebar, storedSlug: storedSlug,
    previewScene: function (canvas, scene, params) {
      if (reduced() || !SCENES[scene]) return null;
      return SCENES[scene](canvas, params || {});
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
