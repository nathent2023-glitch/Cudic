/* CudicKit — behaviour half of cudic-kit.css (vanilla, no deps).
 *   CudicKit.toast('Saved', 'ok')      ok | bad | plain
 *   CudicKit.confirm('Delete thread?') → Promise<boolean>
 *   CudicKit.tabs(container)           wires .ck-tab ↔ .ck-tabpanel
 *   CudicKit.enhance(root)             csel.js dropdowns inside .ck
 * Anything without behaviour (buttons, inputs, checks, switches, chips,
 * range, badges, stamps, stats, progress, tooltips) is pure CSS. */
(function () {
  if (window.CudicKit) return;

  function layer() {
    var el = document.querySelector('.ck-toasts');
    if (!el) {
      el = document.createElement('div');
      el.className = 'ck-toasts';
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    return el;
  }
  function toast(msg, kind, ms) {
    var t = document.createElement('div');
    t.className = 'ck-toast' + (kind === 'ok' ? ' ck-toast-ok' : kind === 'bad' ? ' ck-toast-bad' : '');
    t.textContent = msg;
    layer().appendChild(t);
    setTimeout(function () {
      t.classList.add('out');
      setTimeout(function () { t.remove(); }, 220);
    }, ms || 2600);
  }

  // confirm(): one reusable <dialog> per call, removed after it closes, so a
  // promise can never resolve twice.
  function confirmBox(text, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var d = document.createElement('dialog');
      d.className = 'ck-dialog';
      d.innerHTML = '<h2></h2><p class="ck-muted"></p>';
      d.querySelector('h2').textContent = opts.title || 'Are you sure?';
      d.querySelector('p').textContent = text || '';
      var row = document.createElement('div');
      row.className = 'ck-btn-row';
      var no = document.createElement('button');
      no.type = 'button';
      no.className = 'ck-btn';
      no.textContent = opts.cancel || 'Never mind';
      var yes = document.createElement('button');
      yes.type = 'button';
      yes.className = 'ck-btn ' + (opts.danger ? 'ck-btn-berry' : 'ck-btn-primary');
      yes.textContent = opts.ok || 'Yes, do it';
      var done = false;
      function finish(v) { if (done) return; done = true; resolve(v); d.close(); }
      no.addEventListener('click', function () { finish(false); });
      yes.addEventListener('click', function () { finish(true); });
      d.addEventListener('close', function () { finish(false); setTimeout(function () { d.remove(); }, 0); });
      row.appendChild(no);
      row.appendChild(yes);
      d.appendChild(row);
      document.body.appendChild(d);
      d.showModal();
      yes.focus();
    });
  }

  // tabs(): container holds .ck-tab[data-tab] buttons and .ck-tabpanel[data-panel]
  // sections. Click or arrow keys switch; aria follows.
  function tabs(container) {
    if (!container) return;
    var btns = [].slice.call(container.querySelectorAll('.ck-tab[data-tab]'));
    var panels = [].slice.call(container.querySelectorAll('.ck-tabpanel[data-panel]'));
    function show(name) {
      btns.forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.tab === name)); });
      panels.forEach(function (p) { p.hidden = p.dataset.panel !== name; });
    }
    btns.forEach(function (b) {
      b.addEventListener('click', function () { show(b.dataset.tab); });
      b.addEventListener('keydown', function (e) {
        var i = btns.indexOf(b);
        if (e.key === 'ArrowRight') { e.preventDefault(); btns[(i + 1) % btns.length].focus(); btns[(i + 1) % btns.length].click(); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); var p = btns[(i - 1 + btns.length) % btns.length]; p.focus(); p.click(); }
      });
    });
    var first = btns.filter(function (b) { return b.getAttribute('aria-selected') === 'true'; })[0] || btns[0];
    if (first) show(first.dataset.tab);
  }

  function enhance(root) {
    if (!window.enhanceSelect) return;
    var selects = (root || document).querySelectorAll('.ck select');
    for (var i = 0; i < selects.length; i++) {
      try { enhanceSelect(selects[i]); } catch (e) {}
    }
  }

  document.addEventListener('DOMContentLoaded', function () { enhance(document); });
  window.CudicKit = { toast: toast, confirm: confirmBox, tabs: tabs, enhance: enhance };
})();
