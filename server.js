require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// ── Input validation ──────────────────────────────────────────
// Lobby/username allowlist: blocks tag injection at the source for every client,
// including stale cached pages. Colon allowed for internal server:xxx lobbies.
function validName(s) {
  return typeof s === 'string' && /^[A-Za-z0-9][A-Za-z0-9 _\-:]{0,47}$/.test(s);
}

// ── Rate limiting (in-memory; single instance, resets on restart) ──
const rateBuckets = new Map();
function rateLimit(key, max, windowMs) {
  const now = Date.now();
  let b = rateBuckets.get(key);
  if (!b || b.reset < now) { b = { n: 0, reset: now + windowMs }; rateBuckets.set(key, b); }
  b.n++;
  return b.n <= max;
}
function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return xff.split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

// SMTP fallback (no custom domain needed). Generic SMTP via SMTP_HOST/PORT/USER/PASS,
// or Gmail shorthand via GMAIL_USER + GMAIL_APP_PASSWORD
// (Google Account → Security → 2-Step Verification → App passwords).
// Outlook/ school mail: SMTP_HOST=smtp.office365.com, SMTP_PORT=587,
// SMTP_USER=you@school.edu, SMTP_PASS=your password (SMTP AUTH must be enabled).
let mailTransporter = null;
function getMailTransporter() {
  if (mailTransporter) return mailTransporter;
  const nodemailer = require('nodemailer');
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    mailTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  } else if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    mailTransporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    });
  }
  return mailTransporter;
}
function getMailFrom() {
  return process.env.SMTP_FROM
    || (process.env.SMTP_USER && `Glox <${process.env.SMTP_USER}>`)
    || (process.env.GMAIL_USER && `Glox <${process.env.GMAIL_USER}>`)
    || null;
}

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

  // Baseline security headers (no dep). SAMEORIGIN keeps the sandboxed preview working.
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');

  if (req.method === 'OPTIONS') {
    cors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  // ── API: send verification email ──────────────────────────────
  if (url.pathname === '/auth/send-verification' && req.method === 'POST') {
    cors(res);
    if (!resend && !getMailFrom()) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Email not configured (RESEND_API_KEY or SMTP/Gmail env missing)' }));
      return;
    }
    let body = '';
    for await (const chunk of req) body += chunk;
    try {
      const { email, userId, displayName } = JSON.parse(body);
      if (!email || !userId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'email and userId required' }));
        return;
      }

      // Abuse guard: verification mail is a spam vector (arbitrary recipient)
      const ip = clientIp(req);
      if (!rateLimit('mail:ip:' + ip, 5, 10 * 60 * 1000) || !rateLimit('mail:to:' + email.toLowerCase(), 3, 60 * 60 * 1000)) {
        res.writeHead(429, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Too many requests. Try again later.' }));
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
      const mailHtml = `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:40px 20px;background:#FFFFFF;color:#2E2A4B;border-radius:16px;border:1px solid #C9D5F0;">
            <h1 style="font-size:24px;margin-bottom:8px;">glox<span style="color:#774DCB;">.</span></h1>
            <p style="color:#5C5878;font-size:14px;margin-top:0;">Verify your email to start chatting</p>
            <p style="font-size:15px;line-height:1.6;color:#5C5878;">Hi ${displayName || email},</p>
            <p style="font-size:15px;line-height:1.6;color:#5C5878;">Click the button below to verify your email and start using Glox:</p>
            <a href="${verifyUrl}" style="display:inline-block;padding:14px 32px;background:#774DCB;color:#ffffff;text-decoration:none;border-radius:10px;font-weight:700;font-size:15px;margin:20px 0;">Verify my email</a>
            <p style="font-size:13px;color:#9C97B8;margin-top:24px;">This link expires in 24 hours. If you didn't create an account, ignore this email.</p>
          </div>
        `;
      let mailError = null;
      if (resend) {
        const { error } = await resend.emails.send({
          from: process.env.RESEND_FROM || 'Glox <onboarding@resend.dev>',
          to: email,
          subject: 'Verify your Glox account',
          html: mailHtml,
        });
        if (error) {
          console.error('Resend error:', error);
          mailError = error;
        }
      } else {
        mailError = new Error('Resend not configured');
      }

      // Fall back to SMTP (works without a verified domain)
      if (mailError) {
        try {
          const transporter = getMailTransporter();
          if (!transporter) throw mailError;
          await transporter.sendMail({
            from: getMailFrom(),
            to: email,
            subject: 'Verify your Glox account',
            html: mailHtml,
          });
          mailError = null;
        } catch (smtpErr) {
          console.error('SMTP error:', smtpErr);
        }
      }

      if (mailError) {
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
body{font-family:'Inter',sans-serif;background:#E8EEFA;color:#2E2A4B;min-height:100vh;display:flex;align-items:center;justify-content:center}
.card{max-width:420px;width:94vw;background:#FFFFFF;border-radius:20px;border:1px solid #C9D5F0;padding:36px 32px;text-align:center;box-shadow:0 24px 60px rgba(80,90,180,.20)}
.brand{font-size:1.6rem;font-weight:800;letter-spacing:-.03em;margin-bottom:20px}
.brand span{color:#774DCB}
.status{font-size:3rem;margin-bottom:16px}
.msg{font-size:1rem;color:#5C5878;line-height:1.6;margin-bottom:24px}
.btn{display:inline-block;padding:12px 32px;background:#774DCB;color:#fff;text-decoration:none;border-radius:12px;font-weight:700;font-size:.87rem;font-family:inherit;border:none;cursor:pointer}
.btn:hover{background:#643BAD}
</style></head>
<body>
<div class="card">
  <div class="brand">glox<span>.</span></div>
  <div class="status">${status === 'success' ? '&#9989;' : '&#10060;'}</div>
  <p class="msg">${message}</p>
  <a href="/" class="btn">${status === 'success' ? 'Go to Glox' : 'Back to Glox'}</a>
</div>
</body></html>`;

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
    return;
  }

  // ── Auth callback (server-side fallback) ───────────────────────
  if (url.pathname === '/auth/callback') {
    const code = url.searchParams.get('code');
    if (code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        console.error('Auth callback error:', error.message);
      }
      if (data && data.session) {
        const frontend = 'https://glox-two.vercel.app';
        res.writeHead(302, { Location: frontend + '/?token=' + data.session.access_token });
        res.end();
        return;
      }
    }
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

  // ── API: get profile (user_id + display_name) ──────────────────
  if (url.pathname === '/api/profile' && req.method === 'GET') {
    cors(res);
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) { res.writeHead(401); res.end(); return; }

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) { res.writeHead(401); res.end(); return; }

    const { data: profile, error: profErr } = await supabase
      .from('users')
      .select('user_id, display_name, avatar_url, created_at')
      .eq('id', user.id)
      .single();

    if (profErr || !profile) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ profile: null }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ profile, email: user.email || '' }));
    return;
  }

  // ── API: update display name ───────────────────────────────────
  if (url.pathname === '/api/profile' && req.method === 'PUT') {
    cors(res);
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) { res.writeHead(401); res.end(); return; }

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) { res.writeHead(401); res.end(); return; }

    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        const { display_name } = JSON.parse(body);
        if (!display_name || display_name.trim().length < 1) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Display name required' }));
          return;
        }
        const trimmed = display_name.trim().substring(0, 24);
        const { error: updErr } = await supabase
          .from('users')
          .update({ display_name: trimmed })
          .eq('id', user.id);
        if (updErr) throw updErr;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ display_name: trimmed }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
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
    if (!validName(lobbyName)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid lobby name.' }));
      return;
    }

    // Get or create lobby
    let { data: lobby } = await supabase
      .from('lobbies')
      .select('id, persistent')
      .eq('name', lobbyName)
      .single();

    if (!lobby) {
      const isDefault = ['welcome','hello'].includes(lobbyName);
      const { data: newLobby } = await supabase
        .from('lobbies')
        .insert({ name: lobbyName, persistent: isDefault })
        .select('id, persistent')
        .single();
      lobby = newLobby;
    }

    if (!lobby) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ messages: [], persistent: false }));
      return;
    }

    let query = supabase
      .from('messages')
      .select('display_name, text, created_at')
      .eq('lobby_id', lobby.id)
      .order('created_at', { ascending: true })
      .limit(100);

    // Non-persistent lobbies: only show last 24h of messages
    if (!lobby.persistent) {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      query = query.gte('created_at', yesterday);
    }

    const { data: messages } = await query;

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ messages: messages || [], persistent: lobby.persistent }));
    return;
  }

  // ── API: set lobby persistence (only for owned servers/lobbies) ─
  if (url.pathname === '/api/lobby/persistent' && req.method === 'POST') {
    cors(res);
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) { res.writeHead(401); res.end(); return; }
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) { res.writeHead(401); res.end(); return; }
    const body = await readBody(req);
    const { lobbyName, persistent } = body;
    if (!lobbyName) { res.writeHead(400); res.end(); return; }

    // If it's a server lobby (server:<id>), check server owner
    if (lobbyName.startsWith('server:')) {
      const serverId = lobbyName.slice(7);
      const { data: server } = await supabase.from('servers').select('owner_id').eq('id', serverId).single();
      if (!server || server.owner_id !== user.id) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Only server owner can change persistence' })); return; }
      // For servers, persistence is always true — but allow toggle for lobby part
    } else {
      // Regular lobby: check if it's welcome/hello (always persistent) or owned
      if (['welcome','hello'].includes(lobbyName)) {
        // Keep persistent true for defaults
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, persistent: true }));
        return;
      }
      const { data: lobby } = await supabase.from('lobbies').select('id, created_by').eq('name', lobbyName).single();
      if (!lobby) { res.writeHead(404); res.end(); return; }
      // For random public lobbies with no owner, allow cleanup but not persist toggle
      if (!lobby.created_by) {
        res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Only the lobby owner can make it persistent' })); return;
      }
      if (lobby.created_by !== user.id) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Only lobby owner can change persistence' })); return; }
    }

    const { data: lobby } = await supabase.from('lobbies').select('id').eq('name', lobbyName).single();
    if (!lobby) { res.writeHead(404); res.end(); return; }
    await supabase.from('lobbies').update({ persistent: !!persistent }).eq('id', lobby.id);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, persistent: !!persistent }));
    return;
  }

  // ── API: get lobby info ────────────────────────────────────────
  if (url.pathname === '/api/lobby') {
    cors(res);
    const lobbyName = url.searchParams.get('name');
    if (!lobbyName) { res.writeHead(400); res.end(); return; }
    const { data: lobby } = await supabase
      .from('lobbies')
      .select('name, persistent, created_by, created_at')
      .eq('name', lobbyName)
      .single();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ lobby: lobby || null }));
    return;
  }

  // ── Servers API ──────────────────────────────────────────────

  // List servers: public + owned/private where member
  if (url.pathname === '/api/servers' && req.method === 'GET') {
    cors(res);
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    let userId = null;
    if (token) {
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) userId = user.id;
    }
    let query = supabase.from('servers').select('id, name, description, icon_url, visibility, invite_code, owner_id, created_at, users!owner_id(display_name)').order('created_at', { ascending: false });
    const { data, error } = await query.limit(50);
    // Filter: show public or owned/member
    let filtered = data || [];
    if (userId) {
      // For logged in, also include private servers where user is member (fetch separately)
      const { data: memberServers } = await supabase.from('server_members').select('server_id').eq('user_id', userId);
      const memberIds = new Set((memberServers || []).map(m => m.server_id));
      filtered = filtered.filter(s => s.visibility === 'public' || s.owner_id === userId || memberIds.has(s.id));
    } else {
      filtered = filtered.filter(s => s.visibility === 'public');
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ servers: filtered }));
    return;
  }

  // Get my servers (owned)
  if (url.pathname === '/api/servers/mine' && req.method === 'GET') {
    cors(res);
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) { res.writeHead(401); res.end(); return; }
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) { res.writeHead(401); res.end(); return; }
    const { data } = await supabase.from('servers').select('id, name, description, icon_url, visibility, invite_code, created_at').eq('owner_id', user.id).order('created_at', { ascending: true });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ servers: data || [] }));
    return;
  }

  // Create server (max 3 per user)
  if (url.pathname === '/api/servers' && req.method === 'POST') {
    cors(res);
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
    // Check limit
    const { count } = await supabase.from('servers').select('id', { count: 'exact', head: true }).eq('owner_id', user.id);
    if (count !== null && count >= 3) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'You can own at most 3 servers.' })); return; }
    const body = await readBody(req);
    const name = (body.name || '').trim().replace(/[^a-zA-Z0-9-_]/g, '').substring(0, 20);
    if (!name || name.length < 2) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Server name 2-20 chars (letters, numbers, -,_)' })); return; }
    const invite = crypto.randomBytes(4).toString('hex');
    const { data, error } = await supabase.from('servers').insert({
      name,
      description: (body.description || '').substring(0, 200),
      icon_url: (body.icon_url || '').substring(0, 500),
      visibility: body.visibility === 'private' ? 'private' : 'public',
      invite_code: invite,
      owner_id: user.id,
    }).select().single();
    if (error) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: error.message })); return; }
    // Add owner as member
    await supabase.from('server_members').insert({ server_id: data.id, user_id: user.id });
    // Also ensure a lobby exists for chat
    await supabase.from('lobbies').insert({ name: 'server:' + data.id, created_by: user.id, persistent: true }).select();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ server: data }));
    return;
  }

  // Update server (owner only)
  if (url.pathname.startsWith('/api/servers/') && req.method === 'PUT') {
    cors(res);
    const id = url.pathname.split('/')[3];
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) { res.writeHead(401); res.end(); return; }
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) { res.writeHead(401); res.end(); return; }
    const body = await readBody(req);
    const updates = {};
    if (body.name !== undefined) {
      const n = body.name.trim().replace(/[^a-zA-Z0-9-_]/g, '').substring(0, 20);
      if (n.length >= 2) updates.name = n;
    }
    if (body.description !== undefined) updates.description = body.description.substring(0, 200);
    if (body.icon_url !== undefined) updates.icon_url = body.icon_url.substring(0, 500);
    if (body.visibility !== undefined && ['public','private'].includes(body.visibility)) updates.visibility = body.visibility;
    if (Object.keys(updates).length === 0) { res.writeHead(400); res.end(); return; }
    const { data, error } = await supabase.from('servers').update(updates).eq('id', id).eq('owner_id', user.id).select().single();
    if (error) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: error.message })); return; }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ server: data }));
    return;
  }

  // Delete server
  if (url.pathname.startsWith('/api/servers/') && req.method === 'DELETE') {
    cors(res);
    const id = url.pathname.split('/')[3];
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) { res.writeHead(401); res.end(); return; }
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) { res.writeHead(401); res.end(); return; }
    await supabase.from('servers').delete().eq('id', id).eq('owner_id', user.id);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // Join server (by invite code or public)
  if (url.pathname.endsWith('/join') && req.method === 'POST') {
    cors(res);
    const parts = url.pathname.split('/');
    const id = parts[3];
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) { res.writeHead(401); res.end(); return; }
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) { res.writeHead(401); res.end(); return; }
    const body = await readBody(req).catch(() => ({}));
    const { data: server } = await supabase.from('servers').select('id, visibility, invite_code').eq('id', id).single();
    if (!server) { res.writeHead(404); res.end(); return; }
    if (server.visibility === 'private' && body.invite_code !== server.invite_code) {
      res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Invalid invite code' })); return;
    }
    await supabase.from('server_members').upsert({ server_id: server.id, user_id: user.id }, { onConflict: 'server_id,user_id' });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // Leave server
  if (url.pathname.endsWith('/leave') && req.method === 'POST') {
    cors(res);
    const id = url.pathname.split('/')[3];
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) { res.writeHead(401); res.end(); return; }
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) { res.writeHead(401); res.end(); return; }
    await supabase.from('server_members').delete().eq('server_id', id).eq('user_id', user.id);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // Regenerate invite code
  if (url.pathname.endsWith('/regenerate-invite') && req.method === 'POST') {
    cors(res);
    const id = url.pathname.split('/')[3];
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) { res.writeHead(401); res.end(); return; }
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) { res.writeHead(401); res.end(); return; }
    const newCode = crypto.randomBytes(4).toString('hex');
    const { data } = await supabase.from('servers').update({ invite_code: newCode }).eq('id', id).eq('owner_id', user.id).select().single();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ server: data }));
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
      .select('id, title, description, credits, thumbnail, owner_id, created_at, updated_at, users!owner_id(display_name, user_id)')
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
    const { data, error } = await supabase.from('games').select('*, users(display_name, user_id)').eq('id', id).single();
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
      credits: body.credits || '',
      scene: body.scene || '[]',
      files: body.files || null,
      thumbnail: body.thumbnail || null,
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
    if (body.credits !== undefined) updates.credits = body.credits;
    if (body.scene !== undefined) updates.scene = body.scene;
    if (body.files !== undefined) updates.files = body.files;
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

  // ── Favicon (inline SVG — one route covers every page, no 404 noise) ──
  if (url.pathname === '/favicon.ico') {
    res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' });
    res.end(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#774DCB"/><text x="16" y="23" font-size="18" font-family="sans-serif" font-weight="bold" text-anchor="middle" fill="white">G</text></svg>`);
    return;
  }

  // ── Redirect /chat to /chat.html ───────────────────────────────
  if (url.pathname === '/chat') {
    url.pathname = '/chat.html';
  }

  // ── Redirect /login to / (main page) ──────────────────────────
  if (url.pathname === '/login') {
    url.pathname = '/';
  }

  // ── Redirect /profile to /profile.html ─────────────────────────
  if (url.pathname === '/profile') {
    url.pathname = '/profile.html';
  }

  // ── Redirect /servers to /servers.html ─────────────────────────
  if (url.pathname === '/servers') {
    url.pathname = '/servers.html';
  }

  // ── Redirect /lobbies to /lobbies.html ─────────────────────────
  if (url.pathname === '/lobbies') {
    url.pathname = '/lobbies.html';
  }

  // ── Redirect /games to /games.html ────────────────────────────
  if (url.pathname === '/games') {
    url.pathname = '/games.html';
  }

  // ── Redirect /editor to /editor.html ──────────────────────────
  if (url.pathname === '/editor') {
    url.pathname = '/editor.html';
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
    // Hide server lobbies from public Active lobbies (they're private group chats)
    if (name.startsWith('server:')) continue;
    // Hide empty and ghost lobbies
    if (!users || users.size === 0) { lobbies.delete(name); continue; }
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
      const isDefault2 = ['welcome','hello'].includes(lobbyName);
      const { data: newLobby } = await supabase
        .from('lobbies')
        .insert({ name: lobbyName, persistent: isDefault2 })
        .select('id')
        .single();
      lobby = newLobby;
    }

    if (lobby) {
      await supabase.from('messages').insert({
        lobby_id: lobby.id,
        user_id: userId || null,
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
      if (!validName(lobby) || !validName(username)) {
        ws.send(JSON.stringify({ type: 'error', text: 'Letters, numbers, spaces, - _ : only (max 48 chars).' }));
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

// ── Cleanup: delete messages in non-persistent lobbies older than 2h ─
async function cleanupNonPersistent(){
  try{
    const twoHoursAgo = new Date(Date.now() - 2*60*60*1000).toISOString();
    // Get non-persistent lobby ids
    const { data: lobbies } = await supabase.from('lobbies').select('id').eq('persistent', false);
    if(!lobbies || !lobbies.length) return;
    const ids = lobbies.map(l=>l.id);
    const { error } = await supabase.from('messages').delete().in('lobby_id', ids).lt('created_at', twoHoursAgo);
    if(!error) console.log('[cleanup] removed old messages from', ids.length, 'non-persistent lobbies');
  }catch(e){ console.error('[cleanup] error:', e.message); }
}
setInterval(cleanupNonPersistent, 2*60*60*1000); // every 2 hours
setTimeout(cleanupNonPersistent, 60*1000); // run 1 min after start

// ── Start ────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`\n  Glox is running → http://localhost:${PORT}\n`);
});
