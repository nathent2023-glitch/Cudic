// ── Parse URL params ──────────────────────────────────────────────
const params = new URLSearchParams(window.location.search);
const lobby = params.get('lobby');
const username = params.get('username');
const token = params.get('token');
const isPersistent = params.get('persistent') === '1';

// ── DOM refs ─────────────────────────────────────────────────────
const lobbyTitle = document.getElementById('lobbyTitle');
const chatTitle = document.getElementById('chatTitle');
const messagesEl = document.getElementById('messages');
const chatForm = document.getElementById('chatForm');
const msgInput = document.getElementById('msgInput');
const userListEl = document.getElementById('userList');
const userCountEl = document.getElementById('userCount');
const typingEl = document.getElementById('typingIndicator');
const menuBtn = document.getElementById('menuBtn');
const sidebar = document.querySelector('.chat-sidebar');

// If no lobby, redirect to dedicated lobbies panel
if (!lobby || !username) {
  window.location.href = '/lobbies';
  throw new Error('No lobby');
}

lobbyTitle.textContent = `#${lobby}`;
chatTitle.textContent = `#${lobby}`;

// ── Fetch lobby info (persistent status) ────────────────────────
async function fetchLobbyInfo() {
  try {
    const apiHost = (typeof WS_URL !== 'undefined' && WS_URL) ? WS_URL.replace(/^wss?:\/\//, 'https://') : '';
    const res = await fetch(`${apiHost}/api/lobby?name=${encodeURIComponent(lobby)}`);
    const data = await res.json();
    if (data.lobby && data.lobby.persistent) {
      chatTitle.innerHTML = `#${lobby} <span style="font-size:0.65rem;background:rgba(79,216,151,0.15);color:#4FD897;padding:2px 7px;border-radius:4px;font-weight:500;margin-left:6px;vertical-align:middle">Persistent</span>`;
      lobbyTitle.innerHTML = `#${lobby} <span style="font-size:0.65rem;background:rgba(79,216,151,0.15);color:#4FD897;padding:2px 7px;border-radius:4px;font-weight:500;margin-left:6px">Persistent</span>`;
    } else {
      chatTitle.innerHTML = `#${lobby} <span style="font-size:0.65rem;background:rgba(255,255,255,0.06);color:var(--text-tertiary);padding:2px 7px;border-radius:4px;font-weight:500;margin-left:6px;vertical-align:middle">24h</span>`;
      lobbyTitle.innerHTML = `#${lobby} <span style="font-size:0.65rem;background:rgba(255,255,255,0.06);color:var(--text-tertiary);padding:2px 7px;border-radius:4px;font-weight:500;margin-left:6px">24h</span>`;
    }
  } catch (e) {}
}
fetchLobbyInfo();

// ── Mobile sidebar toggle ────────────────────────────────────────
menuBtn.addEventListener('click', () => {
  sidebar.classList.toggle('open');
});

document.querySelector('.chat-main').addEventListener('click', () => {
  sidebar.classList.remove('open');
});

// ── Resolve user ID from token ───────────────────────────────────
let userId = null;

async function resolveUser() {
  if (!token) return;
  try {
    const apiHost = (typeof WS_URL !== 'undefined' && WS_URL) ? WS_URL.replace(/^wss?:\/\//, '').replace(/^ws/, 'http') : '';
    const res = await fetch(`${apiHost}/api/session`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.user) userId = data.user.id;
  } catch {}
}

// ── Load message history ─────────────────────────────────────────
async function loadHistory() {
  try {
    const apiHost = (typeof WS_URL !== 'undefined' && WS_URL) ? WS_URL.replace(/^wss?:\/\//, '').replace(/^ws/, 'http') : '';
    const res = await fetch(`${apiHost}/api/messages?lobby=${encodeURIComponent(lobby)}`);
    const data = await res.json();
    if (data.messages && data.messages.length) {
      data.messages.forEach(m => {
        const time = new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        addChatMessage(m.display_name, m.text, time);
      });
    }
  } catch {}
}

// ── WebSocket connection ─────────────────────────────────────────
const wsHost = (typeof WS_URL !== 'undefined' && WS_URL) ? WS_URL.replace(/^wss?:\/\//, '') : location.host;
const proto = (typeof WS_URL !== 'undefined' && WS_URL && WS_URL.startsWith('wss')) ? 'wss' : location.protocol === 'https:' ? 'wss' : 'ws';
const ws = new WebSocket(`${proto}://${wsHost}`);

let typingTimeout = null;
let isTyping = false;

ws.onopen = async () => {
  await resolveUser();
  // Set lobby persistence if flagged
  if (isPersistent) {
    try {
      const apiHost = (typeof WS_URL !== 'undefined' && WS_URL) ? WS_URL.replace(/^wss?:\/\//, 'https://') : '';
      await fetch(`${apiHost}/api/lobby/persistent`, { method: 'POST', headers: { 'Authorization': token ? 'Bearer '+token : '', 'Content-Type': 'application/json' }, body: JSON.stringify({ lobbyName: lobby, persistent: true }) });
    } catch (e) {}
  }
  ws.send(JSON.stringify({ type: 'join', lobby, username, userId }));
  await loadHistory();
};
// Ensure server knows we left when navigating away
window.addEventListener('pagehide', function(){ try{ ws.close(); }catch(e){} });
window.addEventListener('beforeunload', function(){ try{ ws.close(); }catch(e){} });

ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);

  switch (msg.type) {
    case 'joined':
      addSystemMessage(`You joined #${msg.lobby}`, 'join');
      break;

    case 'message':
      addChatMessage(msg.username, msg.text, msg.time);
      break;

    case 'user_join':
      addSystemMessage(`${msg.username} joined`, 'join');
      break;

    case 'user_leave':
      addSystemMessage(`${msg.username} left`, 'leave');
      break;

    case 'user_list':
      renderUsers(msg.users);
      break;

    case 'typing':
      showTyping(msg.username);
      break;

    case 'lobby_list':
      break;

    case 'error':
      addSystemMessage(msg.text);
      break;
  }
};

ws.onclose = () => {
  addSystemMessage('Disconnected from server. Refresh to reconnect.');
  msgInput.disabled = true;
};

// ── Send messages ────────────────────────────────────────────────
chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = msgInput.value.trim();
  if (!text || ws.readyState !== 1) return;

  ws.send(JSON.stringify({ type: 'message', text }));
  msgInput.value = '';
  msgInput.focus();

  if (isTyping) {
    isTyping = false;
    clearTimeout(typingTimeout);
  }
});

// ── Typing indicator ─────────────────────────────────────────────
msgInput.addEventListener('input', () => {
  if (!isTyping) {
    isTyping = true;
    ws.send(JSON.stringify({ type: 'typing' }));
  }

  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    isTyping = false;
  }, 2000);
});

// ── Render functions ─────────────────────────────────────────────
function addChatMessage(author, text, time) {
  const div = document.createElement('div');
  div.className = 'msg';
  div.innerHTML = `<span class="author" style="color:${nameColor(author)}">${escapeHtml(author)}</span>${escapeHtml(text)}<span class="time">${time}</span>`;
  messagesEl.appendChild(div);
  scrollToBottom();
}

function addSystemMessage(text, cls = '') {
  const div = document.createElement('div');
  div.className = `system ${cls}`;
  div.textContent = text;
  messagesEl.appendChild(div);
  scrollToBottom();
}

function renderUsers(users) {
  userCountEl.textContent = users.length;
  userListEl.innerHTML = users
    .map(u => `<li style="color:${nameColor(u)}">${escapeHtml(u)}</li>`)
    .join('');
}

function showTyping(name) {
  typingEl.textContent = `${name} is typing...`;
  typingEl.style.display = 'block';
  clearTimeout(showTyping._t);
  showTyping._t = setTimeout(() => {
    typingEl.style.display = 'none';
  }, 3000);
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  });
}

// ── Helpers ──────────────────────────────────────────────────────
function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function nameColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 65%)`;
}

// ── Keyboard shortcut ────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    msgInput.blur();
    sidebar.classList.remove('open');
  }
});
