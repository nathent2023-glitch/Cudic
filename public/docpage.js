/* Shared docs/cookbook/legal shell JS: section router, icons, subtoc, crumb,
   back button, custom scrollbar. Runs on any page with the .docgrid shell. */
(function () {
    var ICONS = {
        // docs sections
        start:'navigation/home.svg', studio:'studio/rocket.svg', files:'files/folder.svg',
        python:'studio/terminal.svg', npm:'studio/code.svg', scratch:'game/cube.svg',
        publish:'files/share.svg', remix:'studio/remix.svg', saves:'studio/cloud.svg',
        chat:'social/chat.svg', multi:'game/gamepad.svg', themes:'studio/theme.svg',
        coins:'game/coin.svg', reports:'status/warning.svg', ai:'studio/sparkle.svg',
        account:'status/user.svg', faq:'status/help.svg', limits:'status/battery.svg',
        credits:'social/star.svg',
        // privacy
        'account-data':'status/user.svg', published:'files/share.svg', local:'files/save.svg',
        advertising:'social/cart.svg', 'third-party':'files/database.svg', children:'social/heart.svg',
        choices:'status/settings.svg', changes:'navigation/arrow.svg',
        // terms (generic fallback handles most)
        // cookbook guides
        platformer:'game/gamepad.svg', clicker:'game/coin.svg', 'cloud-saves':'studio/cloud.svg',
        multiplayer:'social/globe.svg', 'canvas-art':'studio/chart.svg',
        // guide sections
        whole:'game/cube.svg', why:'status/info.svg', next:'navigation/arrow.svg',
        rules:'status/info.svg', code:'studio/code.svg', curve:'studio/chart.svg',
        integers:'game/dice.svg', hook:'game/bolt.svg',
        how:'status/info.svg', pattern:'studio/code.svg', methods:'files/list.svg', budget:'game/coin.svg',
        api:'studio/code.svg', names:'status/user.svg', chase:'game/gamepad.svg',
        crisp:'status/info.svg', gradients:'media/camera.svg', glow:'media/sun.svg',
        particles:'game/bolt.svg', motion:'media/music.svg'
    };
    function iconFor(id) { return ICONS[id] || 'status/info.svg'; }

    function makeIcon(id) {
        var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'si');
        svg.setAttribute('viewBox', '0 0 8 8');
        svg.setAttribute('fill', 'currentColor');
        svg.setAttribute('shape-rendering', 'crispEdges');
        svg.setAttribute('aria-hidden', 'true');
        var use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
        use.setAttributeNS('http://www.w3.org/1999/xlink', 'href', '/cudic-assets/icons/svg/' + iconFor(id));
        svg.appendChild(use);
        return svg;
    }

    var secs = Array.prototype.slice.call(document.querySelectorAll('article section'));
    var nav = document.getElementById('docNav');
    var sub = document.getElementById('subTocLinks');
    var crumb = document.getElementById('crumbSec');
    var titles = {};

    if (secs.length && nav) {
        secs.forEach(function (s, i) {
            var h = s.querySelector('h2');
            titles[s.id] = h ? h.textContent : s.id;
            if (h) h.dataset.n = String(i + 1).padStart(2, '0');
            var a = document.createElement('a');
            a.href = '#' + s.id;
            a.dataset.sec = s.id;
            a.appendChild(makeIcon(s.id));
            var n = document.createElement('span');
            n.className = 'n';
            n.textContent = String(i + 1).padStart(2, '0');
            var t = document.createElement('span');
            t.textContent = titles[s.id];
            a.appendChild(n);
            a.appendChild(t);
            nav.appendChild(a);
        });
        secs.forEach(function (s) {
            Array.prototype.forEach.call(s.querySelectorAll('h3'), function (h, i) {
                if (h.closest('.card')) return;
                if (!h.id) h.id = s.id + '-' + (i + 1);
            });
        });
        function show(id) {
            var sec = document.getElementById(id);
            if (!sec || sec.tagName !== 'SECTION') return false;
            secs.forEach(function (s) { s.classList.toggle('on', s === sec); });
            Array.prototype.forEach.call(nav.querySelectorAll('a'), function (a) { a.classList.toggle('on', a.dataset.sec === id); });
            if (crumb) crumb.textContent = titles[id];
            if (sub) {
                sub.innerHTML = '';
                var count = 0;
                Array.prototype.forEach.call(sec.querySelectorAll('h3'), function (h) {
                    if (h.closest('.card')) return;
                    var l = document.createElement('a');
                    l.href = '#' + h.id;
                    l.textContent = h.textContent;
                    l.className = 'lvl3';
                    sub.appendChild(l);
                    count++;
                });
                var aside = document.getElementById('subToc');
                if (aside) aside.style.display = count ? '' : 'none';
            }
            window.scrollTo(0, 0);
            return true;
        }
        function route() {
            var h = (location.hash || '').slice(1);
            if (!h) { show(secs[0].id); return; }
            var el = document.getElementById(h);
            if (!el) { show(secs[0].id); return; }
            if (el.tagName === 'SECTION') { show(h); return; }
            var parent = el.closest ? el.closest('section') : null;
            if (parent && parent.id) {
                show(parent.id);
                setTimeout(function () { try { el.scrollIntoView(); } catch (e) {} }, 60);
                return;
            }
            show(secs[0].id);
        }
        window.addEventListener('hashchange', route);
        route();
    } else {
        // no sections: hide empty subtoc
        var aside0 = document.getElementById('subToc');
        if (aside0) aside0.style.display = 'none';
    }

    // back button
    var back = document.getElementById('backBtn');
    if (back) back.addEventListener('click', function () {
        if (window.history.length > 1) window.history.back();
        else window.location.href = '/';
    });

    // custom scrollbar
    if (window.matchMedia('(pointer:fine)').matches && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        document.documentElement.classList.add('cuscroll');
        var track = document.createElement('div');
        track.id = 'cudicScroll';
        var thumb = document.createElement('div');
        thumb.id = 'cudicThumb';
        track.appendChild(thumb);
        document.body.appendChild(track);
        function dims() {
            var doc = document.documentElement;
            var max = doc.scrollHeight - window.innerHeight;
            var th = max > 0 ? Math.max(48, window.innerHeight * window.innerHeight / doc.scrollHeight) : 0;
            th = Math.min(th, window.innerHeight - 8);
            return { max: max, th: th, avail: window.innerHeight - th };
        }
        function sync() {
            var d = dims();
            if (d.max <= 0) { track.style.display = 'none'; return; }
            track.style.display = '';
            thumb.style.height = d.th + 'px';
            thumb.style.top = (window.scrollY / d.max) * d.avail + 'px';
        }
        var drag = null;
        thumb.addEventListener('pointerdown', function (e) {
            if (dims().max <= 0) return;
            drag = { y0: e.clientY, t0: thumb.getBoundingClientRect().top };
            thumb.setPointerCapture(e.pointerId);
            track.classList.add('drag');
            e.preventDefault();
        });
        thumb.addEventListener('pointermove', function (e) {
            if (!drag) return;
            var d = dims(), top = Math.max(0, Math.min(d.avail, drag.t0 + e.clientY - drag.y0));
            window.scrollTo({ top: (top / d.avail) * d.max, behavior: 'instant' });
        });
        ['pointerup', 'pointercancel'].forEach(function (t) {
            thumb.addEventListener(t, function () { drag = null; track.classList.remove('drag'); });
        });
        track.addEventListener('pointerdown', function (e) {
            if (e.target !== track) return;
            var d = dims();
            window.scrollTo({ top: Math.max(0, Math.min(e.clientY, d.avail)) / d.avail * d.max });
        });
        addEventListener('scroll', sync, { passive: true });
        addEventListener('resize', sync);
        sync();
    }
})();
