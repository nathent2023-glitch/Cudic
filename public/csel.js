/* Cudic custom dropdowns — progressive enhancement for native <select>.
 * Usage: enhanceSelect(document.getElementById('mySelect')).
 * Keeps the native select (hidden) as source of truth; option changes
 * dispatch a real 'change' event so existing listeners keep working.
 * Vanilla, no dependencies. */
(function () {
  if (window.enhanceSelect) return;
  var cselOpen = null;
  function closeCsel() {
    if (!cselOpen) return;
    cselOpen.menu.hidden = true;
    cselOpen.btn.setAttribute('aria-expanded', 'false');
    cselOpen.wrap.classList.remove('open');
    cselOpen = null;
  }
  document.addEventListener('click', function (e) {
    if (cselOpen && !cselOpen.wrap.contains(e.target)) closeCsel();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeCsel(); });
  function enhanceSelect(sel) {
    if (!sel || sel.dataset.csel) return;
    sel.dataset.csel = '1';
    var wrap = document.createElement('div');
    wrap.className = 'csel';
    sel.parentNode.insertBefore(wrap, sel);
    wrap.appendChild(sel);
    sel.style.display = 'none';
    sel.tabIndex = -1;
    var btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'csel-btn';
    btn.setAttribute('aria-haspopup', 'listbox'); btn.setAttribute('aria-expanded', 'false');
    var label = document.createElement('span');
    var chev = document.createElement('span');
    chev.className = 'chev';
    chev.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg>';
    btn.appendChild(label); btn.appendChild(chev);
    var menu = document.createElement('div');
    menu.className = 'csel-menu'; menu.hidden = true; menu.setAttribute('role', 'listbox');
    function paint() {
      label.textContent = sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].text : '';
      var opts = menu.querySelectorAll('button');
      for (var i = 0; i < opts.length; i++) opts[i].classList.toggle('sel', opts[i].getAttribute('data-v') === sel.value);
    }
    for (var i = 0; i < sel.options.length; i++) {
      (function (opt) {
        var b = document.createElement('button');
        b.type = 'button'; b.setAttribute('role', 'option');
        b.setAttribute('data-v', opt.value); b.textContent = opt.text;
        b.addEventListener('click', function () {
          sel.value = opt.value;
          paint(); closeCsel();
          sel.dispatchEvent(new Event('change', { bubbles: true }));
        });
        menu.appendChild(b);
      })(sel.options[i]);
    }
    btn.addEventListener('click', function () {
      if (cselOpen && cselOpen.wrap === wrap) { closeCsel(); return; }
      closeCsel();
      menu.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      wrap.classList.add('open');
      cselOpen = { wrap: wrap, menu: menu, btn: btn };
    });
    btn.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); btn.click(); }
    });
    wrap.appendChild(btn); wrap.appendChild(menu);
    sel.addEventListener('change', paint);
    paint();
  }
  window.enhanceSelect = enhanceSelect;
  window.closeCsel = closeCsel;
})();
