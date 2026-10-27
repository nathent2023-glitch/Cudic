/* Animated theme toggler — Magic UI "animated-theme-toggler" pattern, vanilla:
   View Transitions API + clip-path circle reveal expanding from the button.
   Swaps the site's glox_theme key and :root[data-theme="light|dark"].
   - Rail pages: #themeBtn already exists; sidebar.js delegates clicks here.
   - Rail-less pages (docs, login, play, run, welcome): creates a fixed
     bottom-right button with the same sun/moon icons. */
(function () {
    var fab = null;

    function isDark() {
        var t = document.documentElement.dataset.theme;
        return t !== 'light';   /* no attr = dark (site boot keeps it set) */
    }

    function flipIcons(dark) {
        var sun = document.getElementById('themeSun'),
            moon = document.getElementById('themeMoon'),
            btn = document.getElementById('themeBtn');
        if (sun) sun.style.display = dark ? '' : 'none';
        if (moon) moon.style.display = dark ? 'none' : '';
        if (btn) btn.title = dark ? 'Switch to light mode' : 'Switch to dark mode';
    }

    /* ev optional: rail buttons pass their click so the reveal starts at the button */
    var _transitioning = false;
    window.CudicThemeToggle = function (ev, btnEl) {
        if (_transitioning) return;   // ignore rapid toggles mid-transition
        var next = isDark() ? 'light' : 'dark';
        function apply() {
            var tokRaw = (typeof localStorage !== 'undefined') ? localStorage.getItem('sb-opimjwmgmzwapkzgxvhk-auth-token') : '';
        var tok = tokRaw ? (function () { try { var s = JSON.parse(tokRaw); return s && s.access_token ? s.access_token : tokRaw; } catch (e) { return tokRaw; } })() : '';
            if (tok && typeof fetch !== 'undefined') {
                fetch('/api/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok }, body: JSON.stringify({ theme: next }) }).catch(function () {});
            }
            document.documentElement.dataset.theme = next;
            flipIcons(next === 'dark');
        }
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !document.startViewTransition) {
            apply();
            return;
        }
        var r = btnEl ? btnEl.getBoundingClientRect() : null;
        var cx = r ? r.left + r.width / 2 : window.innerWidth - 40,
            cy = r ? r.top + r.height / 2 : window.innerHeight - 40,
            w = window.innerWidth, h = window.innerHeight;
        var maxR = Math.max(Math.hypot(cx, cy), Math.hypot(w - cx, cy), Math.hypot(cx, h - cy), Math.hypot(w - cx, h - cy));
        var kx = (cx / w) * 100, ky = (cy / h) * 100,
            kr = (maxR / (Math.hypot(w, h) / Math.SQRT2)) * 100;
        _transitioning = true;
        var t = document.startViewTransition(apply);
        t.ready.then(function () {
            /* percentages, not px — px clip coords land wrong on fractional display scales */
            document.documentElement.animate(
                { clipPath: ['circle(0% at ' + kx + '% ' + ky + '%)', 'circle(' + kr + '% at ' + kx + '% ' + ky + '%)'] },
                { duration: 480, easing: 'steps(6)', pseudoElement: '::view-transition-new(root)' }
            );
        });
        t.finished.then(function () { _transitioning = false; }).catch(function () { _transitioning = false; });
    };

    var css = document.createElement('style');
    css.textContent =
        '::view-transition-old(root),::view-transition-new(root){animation:none;mix-blend-mode:normal}' +
        '.cutheme-fab{position:fixed;right:22px;bottom:20px;z-index:60;width:38px;height:38px;padding:0;display:flex;align-items:center;justify-content:center;background:var(--panel,#14161b);color:var(--ink,#f7f5ec);border:1px solid var(--line,#262a33);cursor:pointer}' +
        '.cutheme-fab:hover{background:var(--ink,#f7f5ec);color:var(--bg,#0d0e10)}' +
        '.cutheme-fab svg{width:16px;height:16px;display:block}';
    document.head.appendChild(css);

    var SUN = '<svg id="themeSun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M19.1 4.9l-1.6 1.6M6.5 17.5l-1.6 1.6"/></svg>';
    var MOON = '<svg id="themeMoon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M20.5 13.6A8.5 8.5 0 1 1 10.4 3.5a7 7 0 0 0 10.1 10.1z"/></svg>';

    var btn = document.getElementById('themeBtn');
    if (!btn) {
        btn = document.createElement('button');
        btn.id = 'themeBtn';
        btn.className = 'cutheme-fab';
        btn.setAttribute('aria-label', 'Toggle light and dark mode');
        btn.innerHTML = SUN + MOON;
        document.body.appendChild(btn);
    }
    btn.addEventListener('click', function (e) {
        e.stopPropagation();
        window.CudicThemeToggle(e, btn);
    });
    flipIcons(isDark());

    /* Boot from account when signed in (supersedes localStorage/default) */
    (function () {
        var tokRaw = (typeof localStorage !== 'undefined') ? localStorage.getItem('sb-opimjwmgmzwapkzgxvhk-auth-token') : '';
        var tok = tokRaw ? (function () { try { var s = JSON.parse(tokRaw); return s && s.access_token ? s.access_token : tokRaw; } catch (e) { return tokRaw; } })() : '';
        if (!tok) return;
        fetch('/api/profile', { headers: { 'Authorization': 'Bearer ' + tok } })
            .then(function (r) { return r.json(); })
            .then(function (d) {
                var t = d.profile && d.profile.theme ? d.profile.theme : 'dark';
                if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
                if (typeof flipIcons === 'function') flipIcons(t === 'dark');
            }).catch(function () {});
    })();
})();
