// ── Chat shell: conversations, DMs, friends ───────────────────────
// Sign-in is required. Identity comes from the session; the server
// derives display names (no client-supplied usernames).

// Stale-page guard: if this script loads against older HTML or CSS
// (missing elements, or layout rules not applied), force one fresh reload
// instead of running broken.
(function () {
  try {
    var need = ['convList', 'chatMain', 'searchView', 'chatEmpty', 'chatForm', 'msgInput'];
    var missing = need.filter(function (id) { return !document.getElementById(id); });
    var cssOk = false;
    try {
      var probe = document.querySelector('.chat-layout');
      var sv = document.getElementById('searchView');
      cssOk = !!probe && getComputedStyle(probe).display === 'flex' &&
              !!sv && getComputedStyle(sv).display === 'none';
    } catch (e) { cssOk = false; }
    if ((missing.length || !cssOk) && !sessionStorage.getItem('cudic_reloaded')) {
      sessionStorage.setItem('cudic_reloaded', '1');
      location.reload();
    }
  } catch (e) {}
})();

var TOKEN = null;
var ME = null;
var convs = [];
var current = null;
var ws = null;
var wsReady = false;
var pendingJoin = null;
var readTimer = null;
var onlineUsers = [];

// ── DOM refs ─────────────────────────────────────────────────────
var chatTitle = document.getElementById('chatTitle');
var chatTopic = document.getElementById('chatTopic');
var onlineCountEl = document.getElementById('onlineCount');
var chatTopbar = document.getElementById('chatTopbar');
var messagesEl = document.getElementById('messages');
var chatEmpty = document.getElementById('chatEmpty');
var chatForm = document.getElementById('chatForm');
var msgInput = document.getElementById('msgInput');
var typingEl = document.getElementById('typingIndicator');
var convListEl = document.getElementById('convList');
var sidebar = document.querySelector('.chat-sidebar');
var searchView = document.getElementById('searchView');
var peopleSearch = document.getElementById('peopleSearch');
var peopleResults = document.getElementById('peopleResults');
var friendsListEl = document.getElementById('friendsList');
var reqBadge = document.getElementById('reqBadge');
var reqIncoming = document.getElementById('reqIncoming');
var reqOutgoing = document.getElementById('reqOutgoing');
var panelStatus = document.getElementById('panelStatus');
var emptyTitle = document.getElementById('emptyTitle');
var emptyText = document.getElementById('emptyText');
var emptyFind = document.getElementById('emptyFind');
var rulesOverlay = document.getElementById('rulesOverlay');
var pendingRulesServer = null;
var convLoadFailed = false;
var convFilter = '';
var peerReadAt = null;
var origTitle = document.title;
var flashCount = 0;
function flashTitle() {
  if (flashCount > 0) document.title = '(' + flashCount + ') ' + origTitle;
  else document.title = origTitle;
}
var convSearch = document.getElementById('convSearch');
convSearch.addEventListener('input', () => { convFilter = convSearch.value; renderConvs(); });

function apiHost() { return (typeof WS_URL !== 'undefined' && WS_URL) ? WS_URL.replace(/^wss?:\/\//, 'https://') : ''; }
async function api(path, opts) {
  opts = opts || {};
  opts.headers = Object.assign({ 'Authorization': 'Bearer ' + TOKEN }, opts.headers || {});
  const r = await fetch(apiHost() + path, opts);
  if (r.status === 401) { window.location.href = '/login'; throw new Error('auth'); }
  return r.json();
}

// ── Boot ─────────────────────────────────────────────────────────
boot().catch(function (e) {
  console.error('chat boot failed', e);
  convLoadFailed = true;
  try { showEmpty(); } catch (e2) {
    console.error('chat empty-state failed', e2);
    try {
      var f = document.createElement('div');
      f.style.cssText = 'margin:auto;max-width:420px;text-align:center;padding:32px;color:var(--text-primary);font-size:0.9rem;';
      f.textContent = 'Chat failed to load. Reload the page — if it persists, open the console (F12) and send the red text.';
      document.getElementById('chatMain').appendChild(f);
    } catch (e3) {}
  }
});
async function boot() {
  try {
    TOKEN = (typeof getAuthToken === 'function') ? await getAuthToken() : null;
  } catch (e) { TOKEN = null; }
  if (!TOKEN) { window.location.href = '/login'; return; }
  try {
    const s = await api('/api/session');
    if (!s || !s.user) { window.location.href = '/login'; return; }
    ME = s.user.id;
  } catch (e) { return; }
  connectWs();
  await refreshConvs();
  const params = new URLSearchParams(window.location.search);
  const cid = params.get('c'), lname = params.get('lobby'), sid = params.get('server');
  var target = null;
  if (cid) target = convs.find(c => c.id === cid);
  if (!target && lname) target = convs.find(c => c.name === lname);
  if (!target && sid) {
    const chans = convs.filter(c => c.server_id === sid);
    target = chans.find(c => c.name.split(':').pop() === 'general') || chans[0];
  }
  openConv(target || convs[0] || null);
  refreshPanel();
  try { sessionStorage.removeItem('cudic_reloaded'); } catch (e) {}
}

// ── WebSocket ────────────────────────────────────────────────────
function connectWs() {
  const wsHost = (typeof WS_URL !== 'undefined' && WS_URL) ? WS_URL.replace(/^wss?:\/\//, '') : location.host;
  const proto = (typeof WS_URL !== 'undefined' && WS_URL && WS_URL.startsWith('wss')) ? 'wss' : location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(proto + '://' + wsHost);
  ws.onopen = () => {
    wsReady = true;
    msgInput.disabled = false;
    if (pendingJoin) { ws.send(pendingJoin); pendingJoin = null; }
  };
  ws.onmessage = onWs;
  ws.onclose = () => {
    wsReady = false;
    if (current) addSystemMessage('Disconnected from server. Refresh to reconnect.');
    msgInput.disabled = true;
  };
}
function sendJoin(name) {
  const payload = JSON.stringify({ type: 'join', lobby: name, token: TOKEN });
  if (wsReady) ws.send(payload); else pendingJoin = payload;
}
// Ensure server knows we left when navigating away
window.addEventListener('pagehide', function () { try { ws.close(); } catch (e) {} });
window.addEventListener('beforeunload', function () { try { ws.close(); } catch (e) {} });

function onWs(e) {
  var msg;
  try { msg = JSON.parse(e.data); } catch (err) { return; }
  switch (msg.type) {
    case 'joined':
      break;
    case 'message':
      if (current && msg.lobby === current.name) {
        addChatMessage(msg.username, msg.text, msg.time, msg.avatar_url, msg.user_id, msg.ts);
        markReadSoon();
        if (document.hidden) { flashCount++; flashTitle(); }
      } else {
        flashCount++; flashTitle();
      }
      break;
    case 'conversation_dirty':
      refreshConvs();
      if (current && current.kind === 'dm') fetchPeer();
      break;
    case 'user_join':
      addSystemMessage(msg.username + ' joined', 'join');
      break;
    case 'user_list':
      onlineUsers = msg.users || [];
      renderOnline();
      break;
    case 'typing':
      if (current && msg.lobby === current.name) showTyping(msg.username);
      break;
    case 'lobby_list':
      break;
    case 'error':
      if (msg.text === 'Sign in required.') { window.location.href = '/login'; return; }
      if (msg.code === 'rules_required' && msg.serverId) { openRulesGate(msg.serverId); return; }
      addSystemMessage(msg.text);
      break;
  }
}

// ── Conversations ────────────────────────────────────────────────
async function refreshConvs() {
  try {
    const d = await api('/api/conversations');
    console.info('[chat] loaded conversations:', (d.conversations || []).length);
    convLoadFailed = false;
    convs = d.conversations || [];
    if (current && !convs.some(c => c.id === current.id)) {
      current = convs[0] || null;
      if (current) openConv(current); else showEmpty();
    }
    renderConvs();
  } catch (e) {
    if (!convs.length) { convLoadFailed = true; showEmpty(); }
  }
}

function renderConvs() {
  if (!convs.length) { convListEl.innerHTML = ''; return; }
  const q = convFilter.trim().toLowerCase();
  const match = c => !q || (c.display || '').toLowerCase().includes(q);
  var html = '';
  var dms = convs.filter(c => c.kind === 'dm').filter(match);
  var chans = convs.filter(c => c.kind !== 'dm').filter(match);
  if (q && !dms.length && !chans.length) {
    convListEl.innerHTML = '<div style="font-size:0.82rem;color:var(--text-tertiary);padding:14px 8px">No conversations match.</div>';
    return;
  }
  if (dms.length) {
    html += '<div class="conv-section"><span>Direct messages</span><span>' + dms.length + '</span></div>';
    dms.forEach(c => { html += convRow(c); });
  }
  if (chans.length) {
    html += '<div class="conv-section"><span>Servers</span><span>' + chans.length + '</span></div>';
    var lastServer = null;
    chans.forEach(c => {
      if (c.server_name !== lastServer) {
        lastServer = c.server_name;
        html += '<div class="conv-server">' + escapeHtml(lastServer || 'Server') + '</div>';
      }
      html += convRow(c);
    });
  }
  convListEl.innerHTML = html;
  convListEl.querySelectorAll('.conv-row').forEach(el => {
    el.addEventListener('click', () => {
      const c = convs.find(x => x.id === el.getAttribute('data-id'));
      if (c) { openConv(c); sidebar.classList.remove('open'); }
    });
  });
}

function convRow(c) {
  const active = (current && current.id === c.id) ? ' active' : '';
  const avatar = c.kind === 'dm'
    ? '<div class="conv-ava">' + (c.peer && c.peer.avatar_url ? '<img src="' + escapeHtml(c.peer.avatar_url) + '" alt="">' : escapeHtml((c.display || '?').substring(0, 1).toUpperCase())) + '</div>'
    : '<div class="conv-hash">#</div>';
  const prev = c.last
    ? escapeHtml((c.last.user_id === ME ? 'you: ' : c.last.display_name + ': ') + c.last.text).substring(0, 60)
    : '<span style="color:var(--text-tertiary)">No messages yet</span>';
  const unread = c.unread ? '<span class="conv-unread">' + (c.unread > 99 ? '99+' : c.unread) + '</span>' : '';
  return '<button class="conv-row' + active + '" data-id="' + c.id + '">' + avatar
    + '<div class="conv-main"><div class="conv-top"><span class="conv-name">' + escapeHtml(c.display) + '</span>'
    + '<span class="conv-time">' + fmtAgo(c.last && c.last.created_at) + '</span></div>'
    + '<div class="conv-bottom"><span class="conv-prev">' + prev + '</span>' + unread + '</div></div></button>';
}

async function openConv(conv) {
  messagesEl.innerHTML = '';
  current = conv;
  searchView.hidden = true;
  rulesOverlay.hidden = true;
  pendingRulesServer = null;
  onlineUsers = [];
  if (!conv) { showEmpty(); return; }
  chatTopbar.hidden = false;
  messagesEl.hidden = false;
  chatEmpty.style.display = 'none';
  chatForm.hidden = false;
  chatTitle.textContent = conv.display;
  chatTopic.textContent = conv.topic || '';
  renderOnline();
  renderConvs();
  try { history.replaceState(null, '', '/chat?c=' + conv.id); } catch (e) {}
  sendJoin(conv.name);
  try {
    const d = await api('/api/messages?lobby=' + encodeURIComponent(conv.name));
    if (current !== conv) return;
    if (d.messages && d.messages.length) {
      d.messages.forEach(m => addChatMessage(m.display_name, m.text, fmtTime(m.created_at), m.users && m.users.avatar_url, m.user_id, m.created_at));
    } else {
      addSystemMessage('No messages yet — say hello.');
    }
  } catch (e) {}
  markRead();
  flashCount = 0; flashTitle();
  fetchPeer();
}

function showEmpty() {
  chatTopbar.hidden = true;
  messagesEl.hidden = true;
  searchView.hidden = true;
  chatEmpty.style.display = 'flex';
  chatForm.hidden = true;
  if (convLoadFailed) {
    emptyTitle.textContent = "Couldn't load conversations";
    emptyText.textContent = 'Check your connection, then try again.';
    emptyFind.textContent = 'Try again';
    emptyFind.onclick = () => window.location.reload();
  } else {
    emptyTitle.textContent = 'No conversations yet';
    emptyText.textContent = 'Message a friend or join a server to get started.';
    emptyFind.textContent = 'Find friends';
    emptyFind.onclick = () => showSearch();
  }
  try { history.replaceState(null, '', '/chat'); } catch (e) {}
}

// ── Read receipts ────────────────────────────────────────────────
function markReadSoon() { clearTimeout(readTimer); readTimer = setTimeout(markRead, 1500); }
async function markRead() {
  if (!current || document.hidden) return;
  const id = current.id;
  try { await api('/api/conversations/' + id + '/read', { method: 'POST' }); } catch (e) { return; }
  const c = convs.find(x => x.id === id);
  if (c) { c.unread = 0; renderConvs(); }
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    flashCount = 0; flashTitle();
    if (current) markReadSoon();
  }
});

// ── Read receipts (DMs): peer's last_read_at paints ✓ → ✓✓ ─────────
async function fetchPeer() {
  peerReadAt = null;
  if (!current || current.kind !== 'dm') return;
  try {
    const d = await api('/api/conversations/' + current.id + '/peer');
    peerReadAt = (d && d.last_read_at) || null;
  } catch (e) {}
  paintTicks();
}
function paintTicks() {
  if (!peerReadAt) return;
  const pr = Date.parse(peerReadAt);
  if (!pr) return;
  messagesEl.querySelectorAll('.ticks[data-ts]').forEach(function (el) {
    const t = Date.parse(el.getAttribute('data-ts'));
    if (t && t <= pr) { el.textContent = '✓✓'; el.classList.add('seen'); }
  });
}

// ── Presence in the header ───────────────────────────────────────
function renderOnline() {
  if (!current) { onlineCountEl.textContent = ''; return; }
  if (current.kind === 'dm' && current.peer) {
    const here = onlineUsers.some(u => u === current.peer.display_name);
    onlineCountEl.innerHTML = here ? '<span class="dot">●</span> online' : '<span>○</span> offline';
  } else {
    onlineCountEl.textContent = onlineUsers.length ? onlineUsers.length + ' online' : '';
  }
}

// ── Search view: find people in the main panel ───────────────────
function showSearch() {
  searchView.hidden = false;
  chatTopbar.hidden = true;
  messagesEl.hidden = true;
  chatEmpty.style.display = 'none';
  chatForm.hidden = true;
  panelStatus.textContent = '';
  refreshPanel();
  setTimeout(() => peopleSearch.focus(), 0);
}
function hideSearch() {
  searchView.hidden = true;
  if (current) {
    chatTopbar.hidden = false;
    messagesEl.hidden = false;
    chatEmpty.style.display = 'none';
    chatForm.hidden = false;
  } else showEmpty();
}
document.getElementById('newMsgBtn').addEventListener('click', showSearch);
document.getElementById('searchClose').addEventListener('click', hideSearch);

async function refreshPanel() {
  try {
    const d = await api('/api/friends');
    panelStatus.textContent = '';
    renderFriends(d.friends || []);
    renderRequests(d.incoming || [], d.outgoing || []);
  } catch (e) { panelStatus.textContent = 'Could not load friends. Check your connection.'; }
}

function avatarHtml(u, size) {
  const s = size || 30;
  const inner = u.avatar_url
    ? '<img src="' + escapeHtml(u.avatar_url) + '" alt="">'
    : escapeHtml((u.display_name || '?').substring(0, 1).toUpperCase());
  return '<div class="conv-ava" style="width:' + s + 'px;height:' + s + 'px">' + inner + '</div>';
}

function renderFriends(list) {
  if (!list.length) {
    friendsListEl.innerHTML = '<div style="font-size:0.8rem;color:var(--text-tertiary)">No friends yet — search above to message or add people.</div>';
    return;
  }
  friendsListEl.innerHTML = '';
  list.forEach(u => {
    const row = document.createElement('div');
    row.className = 'person-row';
    row.innerHTML = avatarHtml(u) + '<span>' + escapeHtml(u.display_name) + '</span>';
    const btn = document.createElement('button');
    btn.className = 'go';
    btn.textContent = 'Message';
    btn.addEventListener('click', () => openDm(u.id, btn));
    row.appendChild(btn);
    friendsListEl.appendChild(row);
  });
}

function renderRequests(incoming, outgoing) {
  if (incoming.length) {
    reqBadge.hidden = false;
    reqBadge.textContent = incoming.length > 99 ? '99+' : incoming.length;
  } else {
    reqBadge.hidden = true;
  }
  reqIncoming.innerHTML = incoming.length ? '' : '<div style="font-size:0.8rem;color:var(--text-tertiary)">Nothing waiting.</div>';
  incoming.forEach(u => {
    const row = document.createElement('div');
    row.className = 'person-row';
    row.innerHTML = avatarHtml(u) + '<span>' + escapeHtml(u.display_name) + '</span>';
    const ok = document.createElement('button');
    ok.className = 'go';
    ok.textContent = 'Accept';
    ok.addEventListener('click', async () => {
      ok.disabled = true;
      await api('/api/friends/' + u.id + '/accept', { method: 'POST' }).catch(() => null);
      refreshPanel();
      refreshConvs();
    });
    const no = document.createElement('button');
    no.textContent = 'Decline';
    no.addEventListener('click', async () => {
      no.disabled = true;
      await api('/api/friends/' + u.id + '/decline', { method: 'POST' }).catch(() => null);
      refreshPanel();
    });
    row.appendChild(ok);
    row.appendChild(no);
    reqIncoming.appendChild(row);
  });
  reqOutgoing.innerHTML = outgoing.length ? '' : '<div style="font-size:0.8rem;color:var(--text-tertiary)">Nothing sent.</div>';
  outgoing.forEach(u => {
    const row = document.createElement('div');
    row.className = 'person-row';
    row.innerHTML = avatarHtml(u) + '<span>' + escapeHtml(u.display_name) + '</span><span class="dim">waiting</span>';
    reqOutgoing.appendChild(row);
  });
}

var searchTimer = null;
peopleSearch.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(runSearch, 300);
});
async function runSearch() {
  const q = peopleSearch.value.trim();
  if (q.length < 2) { peopleResults.innerHTML = ''; return; }
  var d;
  try { d = await api('/api/people?q=' + encodeURIComponent(q)); panelStatus.textContent = ''; }
  catch (e) { panelStatus.textContent = 'Search failed. Check your connection.'; return; }
  peopleResults.innerHTML = '';
  (d.people || []).forEach(u => {
    const row = document.createElement('div');
    row.className = 'person-row';
    row.innerHTML = avatarHtml(u) + '<span>' + escapeHtml(u.display_name) + '</span>';
    const msgBtn = document.createElement('button');
    msgBtn.className = 'go';
    msgBtn.textContent = 'Message';
    msgBtn.addEventListener('click', () => openDm(u.id, msgBtn));
    row.appendChild(msgBtn);
    if (u.friendship === 'pending_out') {
      const st = document.createElement('button');
      st.textContent = 'Requested';
      st.disabled = true;
      row.appendChild(st);
    } else if (u.friendship === 'pending_in') {
      const acc = document.createElement('button');
      acc.textContent = 'Accept';
      acc.addEventListener('click', async () => {
        acc.disabled = true;
        await api('/api/friends/' + u.id + '/accept', { method: 'POST' }).catch(() => null);
        refreshPanel();
        runSearch();
      });
      row.appendChild(acc);
    } else if (u.friendship !== 'accepted') {
      const add = document.createElement('button');
      add.textContent = 'Add';
      add.addEventListener('click', async () => {
        add.disabled = true;
        const r = await api('/api/friends', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: u.id }) }).catch(() => null);
        if (r && r.status === 'accepted') { refreshPanel(); runSearch(); }
        else { add.textContent = 'Requested'; }
      });
      row.appendChild(add);
    }
    peopleResults.appendChild(row);
  });
  if (!(d.people || []).length) {
    peopleResults.innerHTML = '<div style="font-size:0.8rem;color:var(--text-tertiary)">No one found. Try a display name or #id.</div>';
  }
}

async function openDm(userId, btn) {
  if (btn) { btn.disabled = true; }
  var d;
  try { d = await api('/api/dm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) }); }
  catch (e) { panelStatus.textContent = 'Could not start the conversation.'; if (btn) btn.disabled = false; return; }
  await refreshConvs();
  const c = convs.find(x => x.id === d.id);
  if (c) openConv(c);
}

// ── Send messages ────────────────────────────────────────────────
chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = msgInput.value.trim();
  if (!text || !ws || ws.readyState !== 1) return;
  ws.send(JSON.stringify({ type: 'message', text }));
  msgInput.value = '';
  msgInput.focus();
  markReadSoon();
});

// ── Typing indicator ─────────────────────────────────────────────
var typingTimeout = null;
var isTyping = false;
msgInput.addEventListener('input', () => {
  if (!ws || ws.readyState !== 1) return;
  if (!isTyping) {
    isTyping = true;
    ws.send(JSON.stringify({ type: 'typing' }));
  }
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => { isTyping = false; }, 2000);
});

// ── Tapping the chat area dismisses the sidebar (narrow screens) ──
document.getElementById('chatMain').addEventListener('click', () => {
  sidebar.classList.remove('open');
});

// ── Rules gate: accept before talking ────────────────────────────
async function openRulesGate(serverId) {
  pendingRulesServer = serverId;
  document.getElementById('rulesOverlayText').textContent = 'Loading rules…';
  rulesOverlay.hidden = false;
  try {
    const d = await api('/api/servers');
    const s = (d.servers || []).find(x => x.id === serverId);
    document.getElementById('rulesOverlayText').textContent = (s && s.rules) || 'This server requires accepting its rules.';
  } catch (e) {
    document.getElementById('rulesOverlayText').textContent = 'Could not load the rules.';
  }
}
document.getElementById('rulesOverlayLater').addEventListener('click', () => {
  rulesOverlay.hidden = true;
  pendingRulesServer = null;
});
document.getElementById('rulesOverlayAccept').addEventListener('click', async () => {
  if (!pendingRulesServer) return;
  const id = pendingRulesServer;
  try {
    await api('/api/servers/' + id + '/rules/accept', { method: 'POST' });
    rulesOverlay.hidden = true;
    pendingRulesServer = null;
    if (current) sendJoin(current.name);
    refreshConvs();
  } catch (e) {}
});

// ── Render functions ─────────────────────────────────────────────
function addChatMessage(author, text, time, avatar, userId, ts) {
  const div = document.createElement('div');
  const mine = !!(userId && ME && userId === ME);
  div.className = 'msg' + (mine ? ' mine' : '');
  const av = avatar
    ? '<img src="' + escapeHtml(avatar) + '" alt="">'
    : escapeHtml(String(author || '?').substring(0, 1).toUpperCase());
  div.innerHTML = '<div class="msg-ava">' + av + '</div>'
    + '<div class="msg-main"><span class="author" style="color:' + nameColor(author) + '">' + escapeHtml(author) + '</span>'
    + '<span class="time">' + time + '</span>'
    + '<div class="msg-text">' + escapeHtml(text) + (mine ? ' <span class="ticks" data-ts="' + escapeHtml(ts || '') + '">✓</span>' : '') + '</div></div>';
  messagesEl.appendChild(div);
  if (mine) paintTicks();
  scrollToBottom();
}

function addSystemMessage(text, cls) {
  const div = document.createElement('div');
  div.className = 'system ' + (cls || '');
  div.textContent = text;
  messagesEl.appendChild(div);
  scrollToBottom();
}

function showTyping(name) {
  typingEl.textContent = name + ' is typing…';
  typingEl.style.display = 'block';
  clearTimeout(showTyping._t);
  showTyping._t = setTimeout(() => { typingEl.style.display = 'none'; }, 3000);
}

function scrollToBottom() {
  requestAnimationFrame(() => { messagesEl.scrollTop = messagesEl.scrollHeight; });
}

// ── Helpers ──────────────────────────────────────────────────────
function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str == null ? '' : String(str);
  return d.innerHTML;
}

function nameColor(name) {
  name = String(name || '?');
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 65%)`;
}

function fmtTime(iso) {
  try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
  catch (e) { return ''; }
}

function fmtAgo(iso) {
  if (!iso) return '';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return Math.floor(s / 60) + 'm';
  if (s < 86400) return Math.floor(s / 3600) + 'h';
  if (s < 604800) return Math.floor(s / 86400) + 'd';
  try { return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' }); }
  catch (e) { return ''; }
}

// ── Keyboard shortcut ────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!searchView.hidden) hideSearch();
    else { msgInput.blur(); sidebar.classList.remove('open'); }
  }
});
