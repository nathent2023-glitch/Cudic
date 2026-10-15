/* Pring: shared page-loading ring. show() arms a veil that only appears
   if loading takes over ~350ms (fast loads never flash); hide() removes
   it. No dependencies, no framework. Usage:
     Pring.show('Loading gallery…'); …fetch…; Pring.hide();
   Safe to call hide() with nothing showing. */
window.Pring = (function () {
  var el = null, timer = null, labelEl = null;
  function build(label) {
    el = document.createElement('div');
    el.className = 'pring-veil';
    el.style.display = 'none';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<svg viewBox="0 0 100 100" width="64" height="64">'
      + '<circle class="pring-track" cx="50" cy="50" r="45"></circle>'
      + '<circle class="pring-arc" cx="50" cy="50" r="45"></circle></svg>'
      + '<div class="pring-label"></div>';
    labelEl = el.querySelector('.pring-label');
    if (label) labelEl.textContent = label;
    document.body.appendChild(el);
  }
  function show(label) {
    if (el) { if (label && labelEl) labelEl.textContent = label; return; }
    build(label);
    timer = setTimeout(function () {
      timer = null;
      if (el) el.style.display = 'flex';
    }, 350);
  }
  function hide() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (el) { el.remove(); el = null; labelEl = null; }
  }
  return { show: show, hide: hide };
})();
