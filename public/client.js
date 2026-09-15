// ── Parse URL params ──────────────────────────────────────────────
const params = new URLSearchParams(window.location.search);
const lobby = params.get('lobby');
const username = params.get('username');

if (!lobby || !username) {
  window.location.href = '/';
}

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
const sidebar = document.querySelector('.sidebar');

lobbyTitle.textContent = `#${lobby}`;
chatTitle.textContent = `#${lobby}`;

// ── Mobile sidebar toggle ────────────────────────────────────────
menuBtn.addEventListener('click', () => {
  sidebar.classList.toggle('open');
});

// Close sidebar when clicking outside on mobile
document.querySelector('.chat-main').addEventListener('click', () => {
  sidebar.classList.remove('open');
});

// ── WebSocket connection ─────────────────────────────────────────
const wsHost = (typeof WS_URL !== 'undefined' && WS_URL) ? WS_URL.replace(/^wss?:\/\//, '') : location.host;
const proto = (typeof WS_URL !== 'undefined' && WS_URL && WS_URL.startsWith('wss')) ? 'wss' : location.protocol === 'https:' ? 'wss' : 'ws';
const ws = new WebSocket(`${proto}://${wsHost}`);

let typingTimeout = null;
let isTyping = false;

ws.onopen = () => {
  ws.send(JSON.stringify({ type: 'join', lobby, username }));
};

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
      // Ignore on chat page
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

  // Stop typing indicator
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

// Consistent color per username
function nameColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 65%, 70%)`;
}

// ── Keyboard shortcut ────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    msgInput.blur();
    sidebar.classList.remove('open');
  }
});
