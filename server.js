require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY || '');

// ── Email verification tokens ───────────────────────────────────
// token → { email, userId, displayName, expires }
const verifyTokens = new Map();

// Clean expired tokens every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of verifyTokens) {
    if (data.expires < now) verifyTokens.delete(token);
  }
}, 600000);

const PORT = process.env.PORT || 3000;

// ── Supabase ─────────────────────────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || ''
);

// ── Static file server ───────────────────────────────────────────
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

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'OPTIONS') {
    cors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  // ── API: send verification email ──────────────────────────────
  if (url.pathname === '/auth/send-verification' && req.method === 'POST') {
    cors(res);
    let body = '';
    for await (const chunk of req) body += chunk;
    try {
      const { email, userId, displayName } = JSON.parse(body);
      if (!email || !userId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'email and userId required' }));
        return;
      }

      // Generate token
      const token = crypto.randomBytes(32).toString('hex');
      verifyTokens.set(token, {
        email: email.toLowerCase(),
        userId,
        displayName: displayName || email,
        expires: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
      });

      // Send email via Resend
      const verifyUrl = `https://glox-o7rr.onrender.com/auth/verify?token=${token}`;
      const { error } = await resend.emails.send({
        from: 'Glox <onboarding@resend.dev>',
        to: email,
        subject: 'Verify your Glox account',
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:40px 20px;background:#16171a;color:#fafdff;border-radius:16px;">
            <h1 style="font-size:24px;margin-bottom:8px;">glox<span style="color:#bfff3c;">.</span></h1>
            <p style="color:#888;font-size:14px;margin-top:0;">Verify your email to start chatting</p>
            <p style="font-size:15px;line-height:1.6;color:#ccc;">Hi ${displayName || email},</p>
            <p style="font-size:15px;line-height:1.6;color:#ccc;">Click the button below to verify your email and start using Glox:</p>
            <a href="${verifyUrl}" style="display:inline-block;padding:14px 32px;background:#bfff3c;color:#16171a;text-decoration:none;border-radius:10px;font-weight:700;font-size:15px;margin:20px 0;">Verify my email</a>
            <p style="font-size:13px;color:#555;margin-top:24px;">This link expires in 24 hours. If you didn't create an account, ignore this email.</p>
          </div>
        `,
      });

      if (error) {
        console.error('Resend error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to send email' }));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      console.error('send-verification error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Server error' }));
    }
    return;
  }

  // ── API: check verification status ─────────────────────────────
  if (url.pathname === '/auth/check-verified') {
    cors(res);
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ verified: false }));
      return;
    }

    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ verified: false }));
      return;
    }

    // Check if Supabase says email is confirmed
    const verified = !!user.email_confirmed_at;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ verified }));
    return;
  }

  // ── Verify page ─────────────────────────────────────────────────
  if (url.pathname === '/auth/verify') {
    const token = url.searchParams.get('token');
    let status = 'error';
    let message = 'Invalid or expired verification link.';

    if (token && verifyTokens.has(token)) {
      const data = verifyTokens.get(token);
      if (data.expires < Date.now()) {
        verifyTokens.delete(token);
        message = 'This verification link has expired. Please sign up again.';
      } else {
        // Mark email as confirmed in Supabase using service role
        try {
          await supabase.auth.admin.updateUserById(data.userId, {
            email_confirm: true,
          });
          status = 'success';
          message = `Email verified! You can now use Glox.`;
        } catch (err) {
          console.error('Verify update error:', err);
          message = 'Verification failed. Please try again.';
        }
        verifyTokens.delete(token);
      }
    }

    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Glox — Email Verified</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',sans-serif;background:#16171a;color:#fafdff;min-height:100vh;display:flex;align-items:center;justify-content:center}
.card{max-width:420px;width:94vw;background:rgba(22,23,26,.88);backdrop-filter:blur(24px);border-radius:20px;border:1px solid rgba(255,255,255,.07);padding:36px 32px;text-align:center;box-shadow:0 24px 80px rgba(0,0,0,.6)}
.brand{font-size:1.6rem;font-weight:800;letter-spacing:-.03em;margin-bottom:20px}
.brand span{color:#bfff3c}
.status{font-size:3rem;margin-bottom:16px}
.msg{font-size:1rem;color:#ccc;line-height:1.6;margin-bottom:24px}
.btn{display:inline-block;padding:12px 32px;background:#bfff3c;color:#16171a;text-decoration:none;border-radius:12px;font-weight:700;font-size:.87rem;font-family:inherit;border:none;cursor:pointer}
.btn:hover{background:#a8e62e}
</style></head>
<body>
<div class="card">
  <div class="brand">glox<span>.</span></div>
  <div class="status">${status === 'success' ? '&#9989;' : '&#10060;'}</div>
  <p class="msg">${message}</p>
  <a href="/" class="btn">${status === 'success' ? 'Go to Glox' : 'Back to Glox'}</a>
</div></body></html>`;

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
    return;
  }

  // ── Auth callback (server-side fallback) ───────────────────────
  if (url.pathname === '/auth/callback') {
    const code = url.searchParams.get('code');
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        console.error('Auth callback error:', error.message);
      }
    }
    // Redirect to the Vercel frontend, not localhost
    const frontend = 'https://glox-two.vercel.app';
    res.writeHead(302, { Location: frontend + '/' });
    res.end();
    return;
  }

  // ── API: get session ───────────────────────────────────────────
  if (url.pathname === '/api/session') {
    cors(res);
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');

    if (!token) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ user: null }));
      return;
    }

    const { data: { user }, error } = await supabase.auth.getUser(token);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ user: error ? null : user }));
    return;
  }

  // ── API: get message history ───────────────────────────────────
  if (url.pathname === '/api/messages') {
    cors(res);
    const lobbyName = url.searchParams.get('lobby');
    if (!lobbyName) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'lobby param required' }));
      return;
    }

    // Get or create lobby
    let { data: lobby } = await supabase
      .from('lobbies')
      .select('id')
      .eq('name', lobbyName)
      .single();

    if (!lobby) {
      const { data: newLobby } = await supabase
        .from('lobbies')
        .insert({ name: lobbyName })
        .select('id')
        .single();
      lobby = newLobby;
    }

    if (!lobby) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ messages: [] }));
      return;
    }

    const { data: messages } = await supabase
      .from('messages')
      .select('display_name, text, created_at')
      .eq('lobby_id', lobby.id)
      .order('created_at', { ascending: true })
      .limit(100);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ messages: messages || [] }));
    return;
  }

  // ── Helper: parse JSON body ───────────────────────────────────
  function readBody(req) {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => { try { resolve(JSON.parse(body)); } catch { reject(new Error('Invalid JSON')); } });
    });
  }

  // ── API: list published games ──────────────────────────────────
  if (url.pathname === '/api/games' && req.method === 'GET') {
    cors(res);
    const { data, error } = await supabase
      .from('games')
      .select('id, title, description, thumbnail, owner_id, created_at, updated_at')
      .eq('published', true)
      .order('updated_at', { ascending: false })
      .limit(50);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ games: data || [], error: error?.message }));
    return;
  }

  // ── API: get single game ───────────────────────────────────────
  if (url.pathname.startsWith('/api/games/') && req.method === 'GET') {
    cors(res);
    const id = url.pathname.split('/')[3];
    const { data, error } = await supabase.from('games').select('*').eq('id', id).single();
    if (!data) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Not found' })); return; }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ game: data }));
    return;
  }

  // ── API: create game ──────────────────────────────────────────
  if (url.pathname === '/api/games' && req.method === 'POST') {
    cors(res);
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
    const body = await readBody(req);
    const { data, error } = await supabase.from('games').insert({
      owner_id: user.id,
      title: body.title || 'Untitled Game',
      description: body.description || '',
      scene: body.scene || '[]',
      published: body.published || false,
    }).select().single();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ game: data, error: error?.message }));
    return;
  }

  // ── API: update game ──────────────────────────────────────────
  if (url.pathname.startsWith('/api/games/') && req.method === 'PUT') {
    cors(res);
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
    const id = url.pathname.split('/')[3];
    const body = await readBody(req);
    const updates = {};
    if (body.title !== undefined) updates.title = body.title;
    if (body.description !== undefined) updates.description = body.description;
    if (body.scene !== undefined) updates.scene = body.scene;
    if (body.published !== undefined) updates.published = body.published;
    if (body.thumbnail !== undefined) updates.thumbnail = body.thumbnail;
    updates.updated_at = new Date().toISOString();
    const { data, error } = await supabase.from('games').update(updates).eq('id', id).eq('owner_id', user.id).select().single();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ game: data, error: error?.message }));
    return;
  }

  // ── API: delete game ──────────────────────────────────────────
  if (url.pathname.startsWith('/api/games/') && req.method === 'DELETE') {
    cors(res);
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
    const id = url.pathname.split('/')[3];
    await supabase.from('games').delete().eq('id', id).eq('owner_id', user.id);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // ── Redirect /chat to /chat.html ───────────────────────────────
  if (url.pathname === '/chat') {
    url.pathname = '/chat.html';
  }

  let filePath = path.join(__dirname, 'public', url.pathname === '/' ? 'index.html' : url.pathname);
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

// ── WebSocket server ─────────────────────────────────────────────
const wss = new WebSocketServer({ server });

// lobby name → Set of { username, ws, userId }
const lobbies = new Map();

// ws → { username, lobby, userId }
const clients = new Map();

// All connected WebSocket connections (including homepage watchers)
const allConnections = new Set();

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
  const data = JSON.stringify({ type: 'lobby_list', lobbies: list });
  for (const ws of allConnections) {
    if (ws.readyState === 1) {
      ws.send(data);
    }
  }
}

// Save message to Supabase (fire and forget)
async function saveMessage(lobbyName, userId, displayName, text) {
  try {
    // Get or create lobby
    let { data: lobby } = await supabase
      .from('lobbies')
      .select('id')
      .eq('name', lobbyName)
      .single();

    if (!lobby) {
      const { data: newLobby } = await supabase
        .from('lobbies')
        .insert({ name: lobbyName })
        .select('id')
        .single();
      lobby = newLobby;
    }

    if (lobby) {
      await supabase.from('messages').insert({
        lobby_id: lobby.id,
        user_id: userId || '00000000-0000-0000-0000-000000000000',
        display_name: displayName,
        text,
      });
    }
  } catch (err) {
    console.error('Failed to save message:', err.message);
  }
}

wss.on('connection', (ws) => {
  // Track all connections for lobby list broadcasts
  allConnections.add(ws);

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
      const userId = msg.userId || null;

      if (!lobby || !username) {
        ws.send(JSON.stringify({ type: 'error', text: 'Lobby and username are required.' }));
        return;
      }

      // Leave current lobby if any
      const prev = clients.get(ws);
      if (prev) {
        const prevRoom = lobbies.get(prev.lobby);
        if (prevRoom) {
          for (const client of prevRoom) {
            if (client.ws === ws) {
              prevRoom.delete(client);
              break;
            }
          }
          broadcast(prev.lobby, { type: 'user_leave', username: prev.username });
          if (prevRoom.size === 0) lobbies.delete(prev.lobby);
        }
      }

      // Join new lobby — remove any existing entries with same username first
      if (!lobbies.has(lobby)) {
        lobbies.set(lobby, new Set());
      }
      const room = lobbies.get(lobby);
      for (const existing of room) {
        if (existing.username.toLowerCase() === username.toLowerCase()) {
          room.delete(existing);
          try { existing.ws.close(); } catch {}
        }
      }
      const entry = { username, ws, userId };
      room.add(entry);
      clients.set(ws, { username, lobby, userId });

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

      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      broadcast(info.lobby, {
        type: 'message',
        username: info.username,
        text,
        time,
      });

      // Persist to database
      saveMessage(info.lobby, info.userId, info.username, text);
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

  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('close', () => {
    allConnections.delete(ws);
    const info = clients.get(ws);
    if (info) {
      const room = lobbies.get(info.lobby);
      if (room) {
        for (const client of room) {
          if (client.ws === ws) {
            room.delete(client);
            break;
          }
        }
        broadcast(info.lobby, { type: 'user_leave', username: info.username });

        const users = [...room].map(c => c.username);
        broadcast(info.lobby, { type: 'user_list', users });

        if (room.size === 0) lobbies.delete(info.lobby);
      }
      clients.delete(ws);
      sendLobbyListToAll();
    }
  });
});

// ── Heartbeat: kill dead connections every 5s ─────────────────────
setInterval(() => {
  for (const ws of allConnections) {
    if (ws.isAlive === false) {
      allConnections.delete(ws);
      const info = clients.get(ws);
      if (info) {
        const room = lobbies.get(info.lobby);
        if (room) {
          for (const client of room) {
            if (client.ws === ws) {
              room.delete(client);
              break;
            }
          }
          broadcast(info.lobby, { type: 'user_leave', username: info.username });
          const users = [...room].map(c => c.username);
          broadcast(info.lobby, { type: 'user_list', users });
          if (room.size === 0) lobbies.delete(info.lobby);
        }
        clients.delete(ws);
      }
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    try { ws.ping(); } catch {}
  }
  sendLobbyListToAll();
}, 5000);

// ── Start ────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`\n  Glox is running → http://localhost:${PORT}\n`);
});
