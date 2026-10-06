/* CudicSave — account-bound saves for published games.
 * One script tag and progress follows the login across days and devices:
 *   <script src="/cudic-save.js?v=1"></script>
 *   var save = await CudicSave.load({ legacyKey: 'my-old-key', legacyMap: raw => ({best: raw}) });
 *   CudicSave.save({ ... });   // debounced cloud write when signed in
 *   CudicSave.clear();          // reset everywhere
 *
 * Security shape: the game frame is sandboxed and never sees the login
 * token. All cloud traffic goes game -> parent page -> API via postMessage;
 * the parent (view.html) mediates with its own session. Guests persist
 * nothing (memory only) and get a sign-in nudge from the parent instead.
 * Standalone files (no mediating parent: previews, file://) use a local
 * mirror only. Old localStorage keys import once via legacyKey/legacyMap.
 */
(function () {
  var FALLBACK_KEY = 'cudic-save:local';
  var state = { ready: false, authed: false, local: false, key: FALLBACK_KEY, saveTimer: null, lastData: null };
  function readLS(k) { try { var v = localStorage.getItem(k); return v == null ? null : JSON.parse(v); } catch (e) { return null; } }
  function writeLS(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function inPlayer() { try { return window.parent && window.parent !== window; } catch (e) { return false; } }
  var reqSeq = 0, pending = {};
  window.addEventListener('message', function (e) {
    var d = e.data || {};
    if (!d || (d.type !== 'cudic-save-data' && d.type !== 'cudic-save-ack')) return;
    try { if (e.source !== window.parent) return; } catch (err) { return; }
    var cb = pending[d.req];
    if (cb) { delete pending[d.req]; cb(d); }
  });
  function askParent(msg, timeoutMs) {
    return new Promise(function (resolve) {
      if (!inPlayer()) { resolve(null); return; }
      var id = 'r' + (++reqSeq) + Date.now().toString(36);
      msg.req = id;
      pending[id] = resolve;
      try { window.parent.postMessage(msg, '*'); } catch (e) { delete pending[id]; resolve(null); return; }
      setTimeout(function () { if (pending[id]) { delete pending[id]; resolve(null); } }, timeoutMs || 1500);
    });
  }
  async function load(opts) {
    opts = opts || {};
    var ans = await askParent({ type: 'cudic-save-get' });
    if (ans) {
      // Mediated player (game page): parent decides. Guests persist nothing.
      state.authed = !!ans.authed;
      state.local = !!ans.authed;
      if (ans.storageKey) state.key = String(ans.storageKey);
    } else {
      // No mediator (preview, file://): local mirror only, never cloud.
      state.authed = false;
      state.local = true;
    }
    state.ready = true;
    if (!state.local && !state.authed) return null;
    var mirror = readLS(state.key);
    if (!mirror && opts.legacyKey) {
      var raw = readLS(opts.legacyKey);
      if (raw != null) {
        var mapped = opts.legacyMap ? opts.legacyMap(raw) : raw;
        if (mapped && typeof mapped === 'object' && !Array.isArray(mapped)) {
          mirror = { data: mapped, at: 0 };
          writeLS(state.key, mirror);
        }
      }
    }
    var cloud = ans && ans.save && ans.save.data ? ans.save : null;
    if (cloud) {
      var cat = 0;
      try { cat = Date.parse(cloud.updated_at || '') || 0; } catch (e) {}
      var mat = (mirror && mirror.at) || 0;
      if (!mirror || cat >= mat) {
        writeLS(state.key, { data: cloud.data, at: Date.now() });
        return cloud.data;
      }
    }
    return mirror ? mirror.data : null;
  }
  function save(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
    state.lastData = obj;
    if (!state.ready) return;
    if (!state.local && !state.authed) return; // guests: memory only
    if (state.local) writeLS(state.key, { data: obj, at: Date.now() });
    if (!state.authed) return;
    if (state.saveTimer) clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(function () {
      state.saveTimer = null;
      if (inPlayer()) {
        try { window.parent.postMessage({ type: 'cudic-save-set', data: state.lastData }, '*'); } catch (e) {}
      }
    }, 1500);
  }
  function clear() {
    try { localStorage.removeItem(state.key); } catch (e) {}
    if (state.ready && state.authed && inPlayer()) {
      try { window.parent.postMessage({ type: 'cudic-save-del' }, '*'); } catch (e) {}
    }
  }
  window.CudicSave = { load: load, save: save, clear: clear };
})();
