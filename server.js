const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;

// ── Static file server ──────────────────────────────────────────────
const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  // Redirect /chat to /chat.html
  if (req.url === '/chat') {
    req.url = '/chat.html';
  }

  let filePath = path.join(__dirname, 'public', req.url === '/' ? 'index.html' : req.url);
  const ext = path.extname(filePath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

// ── WebSocket server ────────────────────────────────────────────────
const wss = new WebSocketServer({ server });

// lobby name → Set of { username, ws }
const lobbies = new Map();

// ws → { username, lobby }
const clients = new Map();

function broadcast(lobbyName, msg, excludeWs = null) {
  const room = lobbies.get(lobbyName);
  if (!room) return;
  const data = JSON.stringify(msg);
  for (const client of room) {
    if (client.ws !== excludeWs && client.ws.readyState === 1) {
      client.ws.send(data);
    }
  }
}

function getLobbyList() {
  const list = [];
  for (const [name, users] of lobbies) {
    list.push({ name, count: users.size });
  }
  return list.filter(l => l.count > 0);
}

function sendLobbyListToAll() {
  const list = getLobbyList();
  for (const [ws] of clients) {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'lobby_list', lobbies: list }));
    }
  }
}

wss.on('connection', (ws) => {
  // Send current lobby list immediately
  ws.send(JSON.stringify({ type: 'lobby_list', lobbies: getLobbyList() }));

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    // ── Join a lobby ──────────────────────────────────────────────
    if (msg.type === 'join') {
      const lobby = (msg.lobby || '').trim();
      const username = (msg.username || '').trim();

      if (!lobby || !username) {
        ws.send(JSON.stringify({ type: 'error', text: 'Lobby and username are required.' }));
        return;
      }

      // Leave current lobby if any
      const prev = clients.get(ws);
      if (prev) {
        const prevRoom = lobbies.get(prev.lobby);
        if (prevRoom) {
          prevRoom.delete({ username: prev.username, ws });
          broadcast(prev.lobby, { type: 'user_leave', username: prev.username });
          if (prevRoom.size === 0) lobbies.delete(prev.lobby);
        }
      }

      // Join new lobby
      if (!lobbies.has(lobby)) {
        lobbies.set(lobby, new Set());
      }
      const entry = { username, ws };
      lobbies.get(lobby).add(entry);
      clients.set(ws, { username, lobby });

      // Confirm join to this client
      ws.send(JSON.stringify({ type: 'joined', lobby, username }));

      // Notify others in lobby
      broadcast(lobby, { type: 'user_join', username }, ws);

      // Send user list to everyone in lobby
      const users = [...lobbies.get(lobby)].map(c => c.username);
      broadcast(lobby, { type: 'user_list', users });

      // Update lobby list for everyone
      sendLobbyListToAll();
      return;
    }

    // ── Chat message ─────────────────────────────────────────────
    if (msg.type === 'message') {
      const info = clients.get(ws);
      if (!info) return;
      const text = (msg.text || '').trim();
      if (!text) return;

      broadcast(info.lobby, {
        type: 'message',
        username: info.username,
        text,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      });
      return;
    }

    // ── Typing indicator ─────────────────────────────────────────
    if (msg.type === 'typing') {
      const info = clients.get(ws);
      if (!info) return;
      broadcast(info.lobby, { type: 'typing', username: info.username }, ws);
      return;
    }

    // ── Request lobby list refresh ────────────────────────────────
    if (msg.type === 'get_lobbies') {
      ws.send(JSON.stringify({ type: 'lobby_list', lobbies: getLobbyList() }));
      return;
    }
  });

  ws.on('close', () => {
    const info = clients.get(ws);
    if (info) {
      const room = lobbies.get(info.lobby);
      if (room) {
        // Find and remove this client
        for (const client of room) {
          if (client.ws === ws) {
            room.delete(client);
            break;
          }
        }
        broadcast(info.lobby, { type: 'user_leave', username: info.username });

        // Send updated user list
        const users = [...room].map(c => c.username);
        broadcast(info.lobby, { type: 'user_list', users });

        if (room.size === 0) lobbies.delete(info.lobby);
      }
      clients.delete(ws);
      sendLobbyListToAll();
    }
  });
});

// ── Start ───────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`\n  Glox is running → http://localhost:${PORT}\n`);
});
