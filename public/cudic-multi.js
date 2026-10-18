/* CudicMulti — in-game multiplayer for published games.
 *   <script src="/cudic-multi.js?v=2"></script>
 *   var net = CudicMulti.join('main');          // optional room code (default 'main')
 *   net.on('open',  function () { });           // joined the room
 *   net.on('peers', function (list) { });       // [{ id, name }, ...] incl. you
 *   net.on('msg',   function (m) { });          // { from: <peer id>, data }
 *   net.on('error', function (text) { });
 *   net.send({ x: 1 });                         // any JSON value, sent before
 *                                               // 'open' is queued, not dropped
 *   net.id; net.peers; net.leave();
 *
 * Security shape: same as CudicSave. The game frame is sandboxed and never
 * holds the login token or the socket — it asks the host page (view.html, or
 * the Studio preview while you are building), which owns the connection and
 * relays. Rooms are anonymous: signing in is not required to play with
 * others, but a signed-in player shows their profile name.
 *
 * No host page at all (a local .html file, or an embed) means there is no
 * server to talk to, so join() reports it on 'error' instead of going quiet.
 */
(function () {
  var seq = 0;
  var handles = {};

  function inPlayer() {
    try { return window.parent && window.parent !== window; } catch (e) { return false; }
  }

  window.addEventListener('message', function (e) {
    var d = e.data || {};
    if (!d || String(d.type || '').indexOf('cudic-multi-') !== 0) return;
    try { if (e.source !== window.parent) return; } catch (err) { return; }
    var h = handles[d.req];
    if (h) h._recv(d);
  });

  function join(room) {
    var h = {
      id: null,
      peers: [],
      _req: 'm' + (++seq) + Date.now().toString(36),
      _handlers: {},
      _queue: [],
      _open: false,
      _closed: false,
      on: function (ev, fn) {
        if (typeof fn !== 'function') return h;
        (h._handlers[ev] = h._handlers[ev] || []).push(fn);
        return h;
      },
      send: function (data) {
        if (h._closed) return h;
        if (!h._open) { h._queue.push(data); return h; }
        h._post({ type: 'cudic-multi-send', data: data });
        return h;
      },
      leave: function () {
        h._closed = true;
        h._post({ type: 'cudic-multi-leave' });
        h._emit('close');
        return h;
      },
      _post: function (msg) {
        try { if (inPlayer()) window.parent.postMessage(msg, '*'); } catch (e) {}
      },
      _emit: function (ev, arg) {
        var list = h._handlers[ev] || [];
        for (var i = 0; i < list.length; i++) {
          try { list[i](arg); } catch (e) {}
        }
      },
      _recv: function (d) {
        if (d.type === 'cudic-multi-host') {
          // Page-local handshake: a mediator answered, so the wait is over and
          // there is nothing to report to the game yet.
          if (h._hostTimer) { clearTimeout(h._hostTimer); h._hostTimer = null; }
        } else if (d.type === 'cudic-multi-joined') {
          h.id = d.id || h.id;
          h.peers = d.peers || [];
          if (!h._open) {
            h._open = true;
            h._emit('open');
            var q = h._queue;
            h._queue = [];
            for (var i = 0; i < q.length; i++) h.send(q[i]);
          }
          h._emit('peers', h.peers);
        } else if (d.type === 'cudic-multi-peers') {
          h.peers = d.peers || [];
          h._emit('peers', h.peers);
        } else if (d.type === 'cudic-multi-msg') {
          h._emit('msg', { from: d.from, data: d.data });
        } else if (d.type === 'cudic-multi-error') {
          h._closed = true;
          delete handles[d.req];
          h._emit('error', d.text || 'Multiplayer error.');
        }
      }
    };
    handles[h._req] = h;

    // A mediator answers this in-page (no network involved), so a game finds
    // out within a moment whether it is running somewhere that can host a room
    // at all. Without this, a local file or an embed looks silent.
    var noHost = 'Multiplayer needs a Cudic game page — open the game from the gallery, or use the Studio preview while you build. A local file has no game server.';
    h._hostTimer = setTimeout(function () {
      if (h._open || h._closed) return;
      h._closed = true;
      delete handles[h._req];
      h._emit('error', noHost);
    }, 700);

    if (!inPlayer()) {
      // Nothing to talk to, and nowhere to post: the host timer above reports
      // it. (Left un-returned so the error stays async and games can
      // subscribe to it first.)
      return h;
    }

    h._post({ type: 'cudic-multi-hello', req: h._req });
    h._post({
      type: 'cudic-multi-join',
      req: h._req,
      room: typeof room === 'string' ? room : ''
    });
    return h;
  }

  window.CudicMulti = { join: join, version: 1 };
})();
