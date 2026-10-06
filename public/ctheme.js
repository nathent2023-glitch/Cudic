/* .ctheme — the Cudic theme language. Compiles to a pack manifest.
 * Spec: plans/ctheme-language.md. Vanilla, no dependencies.
 * window.CTheme = { parse, generate, sanitizeHtml } */
(function () {
  var FONTS = ['Inter', 'Space Grotesk', 'Sora', 'Manrope', 'Outfit', 'DM Sans', 'JetBrains Mono'];
  var SCENES = ['city-night', 'ember-field'];
  var COLOR_KEYS = ['ink', 'panel', 'raised', 'line', 'signal', 'tp', 'ts', 'tt'];
  var HEX = /^#[0-9a-fA-F]{6}$/;

  /* Strip `# comment` — but never inside quotes, and never a `#` that
   * starts a value (like #7300FF): a comment `#` must be followed by
   * whitespace or end-of-line. */
  function stripComment(line) {
    var q = null;
    for (var i = 0; i < line.length; i++) {
      var c = line[i];
      if (q) { if (c === q) q = null; continue; }
      if (c === '"' || c === "'") { q = c; continue; }
      if (c === '#' && (i === 0 || /\s/.test(line[i - 1])) &&
          (i + 1 >= line.length || /\s/.test(line[i + 1]))) {
        return line.slice(0, i);
      }
    }
    return line;
  }
  function tokens(line) {
    var out = [], m, re = /"([^"]*)"|'([^']*)'|(\S+)/g;
    while ((m = re.exec(line))) out.push(m[1] !== undefined ? m[1] : (m[2] !== undefined ? m[2] : m[3]));
    return out;
  }
  function assetUrl(raw, assets, errors, ln) {
    var m = /^asset\(["']([^"']+)["']\)$/.exec(String(raw || '').trim());
    if (m) {
      if (!assets || !assets[m[1]]) { errors.push('Line ' + ln + ': asset "' + m[1] + '" was never uploaded.'); return null; }
      return assets[m[1]];
    }
    var u = String(raw || '').trim();
    if (/^https:\/\//.test(u) && u.length <= 500 && !/["'<>\s]/.test(u)) return u;
    errors.push('Line ' + ln + ': image must be asset("file") or an https URL.');
    return null;
  }

  function parse(text, assets) {
    var errors = [];
    var pack = { name: '', description: '', price: 0, manifest: {} };
    var m = pack.manifest;
    var lines = String(text || '').split('\n');
    for (var li = 0; li < lines.length; li++) {
      var ln = li + 1;
      var t = tokens(stripComment(lines[li]).trim());
      if (!t.length) continue;
      var d = t[0].toLowerCase(), rest = t.slice(1);
      function need(n, what) {
        if (rest.length < n) { errors.push('Line ' + ln + ': ' + d + ' needs ' + what + '.'); return false; }
        return true;
      }
      if (d === 'name') {
        if (!need(1, 'a name')) continue;
        var nm = rest.join(' ').trim();
        if (nm.length < 2 || nm.length > 40) errors.push('Line ' + ln + ': name must be 2–40 characters.');
        else pack.name = nm;
      } else if (d === 'description') {
        var ds = rest.join(' ').trim();
        if (ds.length > 500) errors.push('Line ' + ln + ': description is too long (500 max).');
        else pack.description = ds;
      } else if (d === 'price') {
        if (!need(1, 'a number')) continue;
        var pr = parseInt(rest[0], 10);
        if (!/^\d+$/.test(rest[0]) || pr < 0 || pr > 100000) errors.push('Line ' + ln + ': price must be 0–100000.');
        else pack.price = pr;
      } else if (d === 'tags') {
        var tags = rest.join(' ').split(',').map(function (s) { return s.trim().replace(/^["']|["']$/g, ''); }).filter(Boolean);
        if (tags.length > 8) errors.push('Line ' + ln + ': up to 8 tags.');
        else if (tags.some(function (x) { return x.length > 24; })) errors.push('Line ' + ln + ': tags must be short text.');
        else m.tags = tags;
      } else if (d === 'radius') {
        if (!need(1, 'a number')) continue;
        var ra = parseInt(rest[0], 10);
        if (!/^\d+$/.test(rest[0]) || ra < 0 || ra > 24) errors.push('Line ' + ln + ': radius must be 0–24.');
        else m.radius = ra;
      } else if (d === 'color') {
        if (!need(2, 'a key and a color')) continue;
        var ck = rest[0].toLowerCase();
        if (COLOR_KEYS.indexOf(ck) === -1) { errors.push('Line ' + ln + ': unknown color "' + rest[0] + '".'); continue; }
        if (!HEX.test(rest[1])) { errors.push('Line ' + ln + ': color must be #rrggbb.'); continue; }
        m.colors = m.colors || {};
        m.colors[ck] = rest[1];
      } else if (d === 'font') {
        if (!need(2, 'head|body and a font')) continue;
        var fk = rest[0].toLowerCase();
        if (fk !== 'head' && fk !== 'body') { errors.push('Line ' + ln + ': font must be head or body.'); continue; }
        var fn = rest.slice(1).join(' ');
        if (FONTS.indexOf(fn) === -1) { errors.push('Line ' + ln + ': unknown font "' + fn + '".'); continue; }
        m.fonts = m.fonts || {};
        m.fonts[fk] = fn;
      } else if (d === 'icons') {
        if (!need(1, 'a set')) continue;
        if (['default', 'neon'].indexOf(rest[0].toLowerCase()) === -1) { errors.push('Line ' + ln + ': icons must be default or neon.'); continue; }
        m.icons = rest[0].toLowerCase();
      } else if (d === 'motion') {
        if (!need(1, 'a preset')) continue;
        if (['calm', 'playful'].indexOf(rest[0].toLowerCase()) === -1) { errors.push('Line ' + ln + ': motion must be calm or playful.'); continue; }
        m.motion = { preset: rest[0].toLowerCase() };
      } else if (d === 'background') {
        if (!need(1, 'none, scene, or image')) continue;
        var bt = rest[0].toLowerCase();
        if (bt === 'none') m.background = { type: 'none' };
        else if (bt === 'scene') {
          if (!rest[1] || SCENES.indexOf(rest[1]) === -1) { errors.push('Line ' + ln + ': unknown scene.'); continue; }
          m.background = { type: 'scene', scene: rest[1], opacity: 0.55, params: {} };
        } else if (bt === 'image') {
          if (!need(2, 'an image')) continue;
          var iu = assetUrl(rest[1], assets, errors, ln);
          if (!iu) continue;
          m.background = { type: 'image', src: iu, opacity: 0.55 };
        } else errors.push('Line ' + ln + ': background must be none, scene, or image.');
      } else if (d === 'opacity') {
        if (!need(1, 'a percent')) continue;
        var op = parseInt(rest[0], 10);
        if (!/^\d+$/.test(rest[0]) || op < 10 || op > 100) { errors.push('Line ' + ln + ': opacity must be 10–100.'); continue; }
        m.background = m.background || { type: 'none' };
        m.background.opacity = op / 100;
      } else if (d === 'param') {
        if (!need(2, 'a key and a number')) continue;
        if (!/^[A-Za-z][A-Za-z0-9_]{0,19}$/.test(rest[0])) { errors.push('Line ' + ln + ': bad param name.'); continue; }
        var pv = parseFloat(rest[1]);
        if (!isFinite(pv)) { errors.push('Line ' + ln + ': params must be numbers.'); continue; }
        m.background = m.background || { type: 'none' };
        m.background.params = m.background.params || {};
        if (Object.keys(m.background.params).length >= 8 && !(rest[0] in m.background.params)) { errors.push('Line ' + ln + ': up to 8 params.'); continue; }
        m.background.params[rest[0]] = pv;
      } else if (d === 'sidebar') {
        if (!need(1, 'none or an image')) continue;
        if (rest[0].toLowerCase() === 'none') { if (m.sidebar) delete m.sidebar; continue; }
        var su = assetUrl(rest[0], assets, errors, ln);
        if (!su) continue;
        m.sidebar = { background: su };
      } else {
        errors.push('Line ' + ln + ': unknown directive "' + t[0] + '".');
      }
    }
    if (!pack.name && !errors.length) errors.push('A pack needs a name.');
    return { pack: pack, errors: errors };
  }

  function q(s) { return /[\s"']/.test(s) ? '"' + s + '"' : s; }
  function generate(pack) {
    var m = (pack && pack.manifest) || {}, L = [];
    L.push('name ' + q(pack.name || 'Untitled pack'));
    if (pack.description) L.push('description ' + q(pack.description));
    if (pack.price) L.push('price ' + pack.price);
    if (m.tags && m.tags.length) L.push('tags ' + m.tags.join(', '));
    if (m.radius != null) L.push('radius ' + m.radius);
    L.push('');
    var c = m.colors || {};
    COLOR_KEYS.forEach(function (k) { if (c[k]) L.push('color ' + k + ' ' + c[k]); });
    if (m.fonts) {
      if (m.fonts.head) L.push('font head ' + q(m.fonts.head));
      if (m.fonts.body) L.push('font body ' + q(m.fonts.body));
    }
    if (m.icons) L.push('icons ' + m.icons);
    if (m.motion && m.motion.preset) L.push('motion ' + m.motion.preset);
    L.push('');
    var bg = m.background || { type: 'none' };
    if (bg.type === 'scene') {
      L.push('background scene ' + bg.scene);
      if (bg.opacity != null) L.push('opacity ' + Math.round(bg.opacity * 100));
      Object.keys(bg.params || {}).forEach(function (k) { L.push('param ' + k + ' ' + bg.params[k]); });
    } else if (bg.type === 'image') {
      L.push('background image ' + bg.src);
      if (bg.opacity != null) L.push('opacity ' + Math.round(bg.opacity * 100));
    } else L.push('background none');
    if (m.sidebar && m.sidebar.background) L.push('sidebar ' + m.sidebar.background);
    return L.join('\n');
  }

  /* Sanitize custom pack HTML: allowlist of tags/attrs, https sources only,
   * inline styles scrubbed of script-ish constructs. Scripts never run:
   * parsing happens in an inert <template>. */
  var OK_TAGS = { DIV: 1, SPAN: 1, P: 1, IMG: 1, VIDEO: 1, SOURCE: 1 };
  var DROP_ALL = { SCRIPT: 1, STYLE: 1, IFRAME: 1, OBJECT: 1, EMBED: 1, FORM: 1, INPUT: 1, BUTTON: 1, TEXTAREA: 1, SELECT: 1, LINK: 1, META: 1, BASE: 1, AUDIO: 1, CANVAS: 1, SVG: 1, MATH: 1, A: 1 };
  function scrubStyle(s) {
    s = String(s || '');
    if (/javascript\s*:|expression\s*\(|behaviour|binding/ig.test(s)) return '';
    return s.replace(/url\(\s*["']?(?!https:)[^)]*\)/ig, 'url()');
  }
  function sanitizeHtml(html) {
    // The engine owns rendering user HTML: use it when loaded so preview
    // and install can never disagree. Built-in copy is the fallback.
    if (window.CudicTheme && window.CudicTheme.sanitizeCustomHtml) {
      try { return window.CudicTheme.sanitizeCustomHtml(html); } catch (e) {}
    }
    var tpl = document.createElement('template');
    tpl.innerHTML = String(html || '');
    function clean(node) {
      var kids = Array.prototype.slice.call(node.childNodes);
      for (var i = 0; i < kids.length; i++) {
        var k = kids[i];
        if (k.nodeType === 8) { node.removeChild(k); continue; } // comments
        if (k.nodeType !== 1) continue; // keep text
        if (DROP_ALL[k.tagName]) { node.removeChild(k); continue; }
        if (!OK_TAGS[k.tagName]) {
          clean(k); // unwrap: keep children, drop wrapper
          while (k.firstChild) node.insertBefore(k.firstChild, k);
          node.removeChild(k);
          continue;
        }
        var allow = ['class', 'alt', 'loop', 'muted', 'autoplay', 'playsinline'];
        if (k.tagName === 'IMG' || k.tagName === 'VIDEO' || k.tagName === 'SOURCE') allow.push('src');
        if (k.tagName === 'DIV' || k.tagName === 'SPAN' || k.tagName === 'P') allow.push('style');
        var attrs = Array.prototype.slice.call(k.attributes);
        for (var j = 0; j < attrs.length; j++) {
          var a = attrs[j].name.toLowerCase();
          if (allow.indexOf(a) === -1) { k.removeAttribute(attrs[j].name); continue; }
          if (a === 'src' && !/^https:\/\//.test(k.getAttribute(attrs[j].name) || '')) k.removeAttribute(attrs[j].name);
          if (a === 'style') {
            var s = scrubStyle(k.getAttribute('style'));
            if (s) k.setAttribute('style', s); else k.removeAttribute('style');
          }
        }
        clean(k);
      }
    }
    clean(tpl.content);
    return tpl.content.innerHTML;
  }

  window.CTheme = { parse: parse, generate: generate, sanitizeHtml: sanitizeHtml };
})();
