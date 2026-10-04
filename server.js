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
// Room-name allowlist: blocks tag injection at the source for every client,
// including stale cached pages. Colon allowed for internal chan:/dm: rooms.
function validName(s) {
  // Max 96: system room names run long (chan:<uuid>:<slug> is ~50,
  // dm:<uuid>-<uuid> is 76). User input is validated tighter at creation.
  return typeof s === 'string' && /^[A-Za-z0-9][A-Za-z0-9 _\-:]{0,95}$/.test(s);
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
    || (process.env.SMTP_USER && `Cudic <${process.env.SMTP_USER}>`)
    || (process.env.GMAIL_USER && `Cudic <${process.env.GMAIL_USER}>`)
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
  '.mjs': 'text/javascript',
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
            <h1 style="font-size:24px;margin-bottom:8px;">cudic<span style="color:#774DCB;">.</span></h1>
            <p style="color:#5C5878;font-size:14px;margin-top:0;">Verify your email to start chatting</p>
            <p style="font-size:15px;line-height:1.6;color:#5C5878;">Hi ${displayName || email},</p>
            <p style="font-size:15px;line-height:1.6;color:#5C5878;">Click the button below to verify your email and start using Cudic:</p>
            <a href="${verifyUrl}" style="display:inline-block;padding:14px 32px;background:#774DCB;color:#ffffff;text-decoration:none;border-radius:10px;font-weight:700;font-size:15px;margin:20px 0;">Verify my email</a>
            <p style="font-size:13px;color:#9C97B8;margin-top:24px;">This link expires in 24 hours. If you didn't create an account, ignore this email.</p>
          </div>
        `;
      let mailError = null;
      if (resend) {
        const { error } = await resend.emails.send({
          from: process.env.RESEND_FROM || 'Cudic <onboarding@resend.dev>',
          to: email,
          subject: 'Verify your Cudic account',
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
            subject: 'Verify your Cudic account',
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
          message = `Email verified! You can now use Cudic.`;
        } catch (err) {
          console.error('Verify update error:', err);
          message = 'Verification failed. Please try again.';
        }
        verifyTokens.delete(token);
      }
    }

    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Cudic — Email Verified</title>
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
  <div class="brand">cudic<span>.</span></div>
  <div class="status">${status === 'success' ? '&#9989;' : '&#10060;'}</div>
  <p class="msg">${message}</p>
  <a href="/" class="btn">${status === 'success' ? 'Go to Cudic' : 'Back to Cudic'}</a>
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
        const frontend = 'https://cudic.vercel.app';
        res.writeHead(302, { Location: frontend + '/?token=' + data.session.access_token });
        res.end();
        return;
      }
    }
    const frontend = 'https://cudic.vercel.app';
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
        const { display_name, avatar_url } = JSON.parse(body);
        var updates = {};
        if (display_name !== undefined) {
          if (!display_name || display_name.trim().length < 1) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Display name required' }));
            return;
          }
          updates.display_name = display_name.trim().substring(0, 24);
        }
        if (avatar_url !== undefined) {
          const a = String(avatar_url || '').trim().substring(0, 500);
          if (a) {
            // Only our own avatars bucket: no hotlinking, no data URLs in the row.
            const prefix = (process.env.SUPABASE_URL || '') + '/storage/v1/object/public/avatars/';
            if (!a.startsWith(prefix)) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Invalid avatar URL.' }));
              return;
            }
            updates.avatar_url = a;
          } else {
            updates.avatar_url = null;
          }
        }
        if (!Object.keys(updates).length) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Nothing to update.' }));
          return;
        }
        const { error: updErr } = await supabase
          .from('users')
          .update(updates)
          .eq('id', user.id);
        if (updErr) throw updErr;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(Object.assign({ ok: true }, updates)));
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
    const user = await requireUser(req, res); if (!user) return;
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

    // No creation here: conversations are opened via /api/dm or channel create.
    const { data: lobby } = await supabase
      .from('lobbies')
      .select('id, name, kind, server_id, is_private')
      .eq('name', lobbyName)
      .single();

    // Deliberately 404 (not 403) so room names can't be probed.
    if (!lobby || !(await canSeeLobby(user.id, lobby))) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found.' }));
      return;
    }

    const { data: messages } = await supabase
      .from('messages')
      .select('display_name, text, created_at, user_id, users!messages_user_id_fkey(avatar_url)')
      .eq('lobby_id', lobby.id)
      .order('created_at', { ascending: true })
      .limit(100);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ messages: messages || [], persistent: true }));
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
    let query = supabase.from('servers').select('id, name, description, icon_url, visibility, invite_code, owner_id, rules, created_at, users!owner_id(display_name)').order('created_at', { ascending: false });
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
    // Liveness per server: member counts (one query) + online now
    // (sum of live sockets across the server's channels, same process).
    const sids = filtered.map(s => s.id);
    var memberCount = {};
    if (sids.length) {
      const { data: mems } = await supabase.from('server_members').select('server_id').in('server_id', sids);
      (mems || []).forEach(m => { memberCount[m.server_id] = (memberCount[m.server_id] || 0) + 1; });
    }
    const withLive = filtered.map(s => {
      var online = 0;
      try {
        for (const entry of lobbies) {
          if (typeof entry[0] === 'string' && entry[0].startsWith('chan:' + s.id + ':')) online += entry[1].size;
        }
      } catch (e) {}
      return Object.assign({}, s, { member_count: memberCount[s.id] || 0, online });
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ servers: withLive }));
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
    const { data } = await supabase.from('servers').select('id, name, description, icon_url, visibility, invite_code, rules, created_at').eq('owner_id', user.id).order('created_at', { ascending: true });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ servers: data || [] }));
    return;
  }

  // ── Server templates: preset channel bundles picked at creation ──
  // (Discord-style: Gaming, School, Study, Friends, Local Community).
  // Single source of truth — the create-server picker reads these.
  const SERVER_TEMPLATES = {
    blank: { name: 'Blank', description: 'Just the basics.', channels: [
      { slug: 'general', topic: '' },
      { slug: 'random', topic: '' } ] },
    gaming: { name: 'Gaming', description: 'Coordinate sessions and share clips.', channels: [
      { slug: 'general', topic: 'Home base' },
      { slug: 'clips', topic: 'Screenshots and clips' },
      { slug: 'lfg', topic: 'Find players' },
      { slug: 'off-topic', topic: '' } ] },
    school: { name: 'School', description: 'Classes, homework help, resources.', channels: [
      { slug: 'general', topic: 'Home base' },
      { slug: 'homework-help', topic: 'Ask and answer' },
      { slug: 'resources', topic: 'Notes and links' },
      { slug: 'off-topic', topic: '' } ] },
    study: { name: 'Study Group', description: 'Goals, questions, shared resources.', channels: [
      { slug: 'general', topic: 'Home base' },
      { slug: 'goals', topic: 'Daily goals' },
      { slug: 'questions', topic: 'Ask anything' },
      { slug: 'resources', topic: 'Shared notes and links' } ] },
    friends: { name: 'Friends', description: 'Your circle, nothing formal.', channels: [
      { slug: 'general', topic: 'Home base' },
      { slug: 'plans', topic: 'Make plans' },
      { slug: 'media', topic: 'Photos and clips' },
      { slug: 'random', topic: '' } ] },
    community: { name: 'Local Community', description: 'Neighborhood hub: events and tips.', channels: [
      { slug: 'general', topic: 'Home base' },
      { slug: 'announcements', topic: 'Official updates' },
      { slug: 'events', topic: 'What is happening' },
      { slug: 'recommendations', topic: 'Tips and finds' } ] },
  };
  const STARTER_RULES = [
    'Be kind — no harassment, hate speech, or slurs.',
    'No spam, ads, or NSFW.',
    'Keep channels on topic.',
    'Respect other members and their DMs.',
    'Follow community guidelines.',
  ].join('\n');

  // ── API: list server templates (public, static data) ────────────
  if (url.pathname === '/api/server-templates' && req.method === 'GET') {
    cors(res);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      templates: Object.keys(SERVER_TEMPLATES).map(k => ({
        slug: k, name: SERVER_TEMPLATES[k].name,
        description: SERVER_TEMPLATES[k].description,
        channels: SERVER_TEMPLATES[k].channels,
      })),
      starterRules: STARTER_RULES,
    }));
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
    if (count !== null && count >= 50) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'You can own at most 50 servers.' })); return; }
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
      rules: String(body.rules || '').substring(0, 2000),
    }).select().single();
    if (error) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: error.message })); return; }
    // Add owner as member with the owner role
    await supabase.from('server_members').insert({ server_id: data.id, user_id: user.id, role: 'owner' });
    // Channels from the picked template (blank = general + random)
    const tpl = SERVER_TEMPLATES[body.template] || SERVER_TEMPLATES.blank;
    await supabase.from('lobbies').insert(tpl.channels.map(c => ({
      name: 'chan:' + data.id + ':' + c.slug, kind: 'channel',
      server_id: data.id, topic: c.topic || '', created_by: user.id,
    })));
    sendConversationsDirty();
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
    if (body.rules !== undefined) updates.rules = String(body.rules || '').substring(0, 2000);
    if (Object.keys(updates).length === 0) { res.writeHead(400); res.end(); return; }
    const { data, error } = await supabase.from('servers').update(updates).eq('id', id).eq('owner_id', user.id).select().single();
    if (error) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: error.message })); return; }
    sendConversationsDirty();
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
    sendConversationsDirty();
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

  // My membership in a server (role + rules acceptance)
  if (url.pathname.startsWith('/api/servers/') && url.pathname.endsWith('/membership') && req.method === 'GET') {
    cors(res);
    const id = url.pathname.split('/')[3];
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) { res.writeHead(401); res.end(); return; }
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) { res.writeHead(401); res.end(); return; }
    if (!isUuid(id)) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Invalid server.' })); return; }
    const { data: m } = await supabase.from('server_members').select('role, rules_accepted_at').eq('server_id', id).eq('user_id', user.id).single();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ member: !!m, role: m ? m.role : null, accepted: !!(m && m.rules_accepted_at) }));
    return;
  }

  // Accept a server's rules (must already be a member)
  if (url.pathname.startsWith('/api/servers/') && url.pathname.endsWith('/rules/accept') && req.method === 'POST') {
    cors(res);
    const id = url.pathname.split('/')[3];
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) { res.writeHead(401); res.end(); return; }
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) { res.writeHead(401); res.end(); return; }
    if (!isUuid(id)) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Invalid server.' })); return; }
    const { data: m } = await supabase.from('server_members').select('server_id').eq('server_id', id).eq('user_id', user.id).single();
    if (!m) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Join this server first.' })); return; }
    await supabase.from('server_members').update({ rules_accepted_at: new Date().toISOString() }).eq('server_id', id).eq('user_id', user.id);
    sendConversationsDirty();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // ── Chat rebuild: conversations, DMs, friends, channels ─────────
  // Every endpoint here requires a signed-in user. The WS layer below
  // enforces the same membership rules on join.
  async function requireUser(req, res) {
    const t = (req.headers.authorization || '').replace('Bearer ', '');
    if (!t) { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Sign in required.' })); return null; }
    const { data: { user }, error } = await supabase.auth.getUser(t);
    if (error || !user) { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Sign in required.' })); return null; }
    return user;
  }
  function dmRoomName(a, b) { return 'dm:' + [a, b].sort().join('-'); }
  function chanRoomName(serverId, slug) { return 'chan:' + serverId + ':' + slug; }
  function chanSlug(s) { return String(s || '').toLowerCase().trim().replace(/[^a-z0-9-_]/g, '').substring(0, 30); }
  function chanDisplay(name) { var p = String(name || '').split(':'); return '#' + (p[p.length - 1] || name); }
  function isUuid(s) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s || '')); }

  // ── API: my conversations (chat sidebar) ───────────────────────
  if (url.pathname === '/api/conversations' && req.method === 'GET') {
    cors(res);
    const user = await requireUser(req, res); if (!user) return;
    const me = user.id;
    const { data: memberRows } = await supabase.from('server_members').select('server_id').eq('user_id', me);
    const serverIds = [...new Set((memberRows || []).map(r => r.server_id))];
    const { data: ownedRows } = await supabase.from('servers').select('id').eq('owner_id', me);
    const ownedIds = (ownedRows || []).map(r => r.id);
    ownedIds.forEach(id => { if (!serverIds.includes(id)) serverIds.push(id); });
    const { data: myRows } = await supabase.from('conversation_members').select('lobby_id').eq('user_id', me);
    const myIds = (myRows || []).map(r => r.lobby_id);
    var lobbyRows = [];
    if (myIds.length) {
      const { data } = await supabase.from('lobbies').select('id, name, kind, server_id, topic, is_private, created_at').in('id', myIds);
      (data || []).forEach(r => lobbyRows.push(r));
    }
    if (serverIds.length) {
      const { data } = await supabase.from('lobbies').select('id, name, kind, server_id, topic, is_private, created_at').eq('kind', 'channel').in('server_id', serverIds).eq('is_private', false);
      (data || []).forEach(r => { if (!lobbyRows.some(x => x.id === r.id)) lobbyRows.push(r); });
    }
    if (ownedIds.length) {
      const { data } = await supabase.from('lobbies').select('id, name, kind, server_id, topic, is_private, created_at').eq('kind', 'channel').in('server_id', ownedIds);
      (data || []).forEach(r => { if (!lobbyRows.some(x => x.id === r.id)) lobbyRows.push(r); });
    }
    if (!lobbyRows.length) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ conversations: [] })); return; }
    const lobbyIds = lobbyRows.map(r => r.id);
    const srvIds = [...new Set(lobbyRows.map(r => r.server_id).filter(Boolean))];
    var srvById = {};
    if (srvIds.length) {
      const { data: srvs } = await supabase.from('servers').select('id, name').in('id', srvIds);
      (srvs || []).forEach(s => { srvById[s.id] = s.name; });
    }
    const dmIds = lobbyRows.filter(r => r.kind === 'dm').map(r => r.id);
    var peerByLobby = {};
    if (dmIds.length) {
      const { data: parts } = await supabase.from('conversation_members').select('lobby_id, user_id').in('lobby_id', dmIds).neq('user_id', me);
      const peerIds = [...new Set((parts || []).map(p => p.user_id))];
      var peerById = {};
      if (peerIds.length) {
        const { data: peers } = await supabase.from('users').select('id, display_name, avatar_url, user_id').in('id', peerIds);
        (peers || []).forEach(p => { peerById[p.id] = p; });
      }
      (parts || []).forEach(p => { if (!peerByLobby[p.lobby_id] && peerById[p.user_id]) peerByLobby[p.lobby_id] = peerById[p.user_id]; });
    }
    const { data: stateRows } = await supabase.from('conversation_state').select('lobby_id, last_read_at').eq('user_id', me).in('lobby_id', lobbyIds);
    var readByLobby = {};
    (stateRows || []).forEach(s => { readByLobby[s.lobby_id] = s.last_read_at; });
    var out = [];
    for (const row of lobbyRows) {
      const { data: lastRows } = await supabase.from('messages').select('text, display_name, created_at, user_id').eq('lobby_id', row.id).order('created_at', { ascending: false }).limit(1);
      const last = (lastRows && lastRows[0]) || null;
      var unread = 0;
      if (last) {
        var uq = supabase.from('messages').select('id', { count: 'exact', head: true }).eq('lobby_id', row.id).neq('user_id', me);
        if (readByLobby[row.id]) uq = uq.gt('created_at', readByLobby[row.id]);
        const { count } = await uq;
        unread = count || 0;
      }
      var online = 0;
      try { const rm = lobbies.get(row.name); if (rm) online = rm.size; } catch (e) {}
      const item = { id: row.id, name: row.name, kind: row.kind, topic: row.topic || '', is_private: !!row.is_private, last, unread, online };
      if (row.kind === 'dm') {
        const peer = peerByLobby[row.id] || null;
        item.display = peer ? peer.display_name : 'Direct message';
        item.peer = peer;
      } else {
        item.server_id = row.server_id;
        item.server_name = srvById[row.server_id] || '';
        item.display = chanDisplay(row.name);
      }
      item.sortKey = (last && last.created_at) || row.created_at;
      out.push(item);
    }
    out.sort((a, b) => (a.sortKey < b.sortKey ? 1 : -1));
    out.forEach(o => delete o.sortKey);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ conversations: out }));
    return;
  }

  // ── API: find people (start a DM) ──────────────────────────────
  if (url.pathname === '/api/people' && req.method === 'GET') {
    cors(res);
    const user = await requireUser(req, res); if (!user) return;
    const me = user.id;
    const q = (url.searchParams.get('q') || '').trim();
    if (q.length < 2) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ people: [] })); return; }
    var pq = supabase.from('users').select('id, display_name, avatar_url, user_id').neq('id', me).limit(20);
    if (/^\d+$/.test(q)) pq = pq.eq('user_id', parseInt(q, 10));
    else pq = pq.ilike('display_name', '%' + q.replace(/[%_\\]/g, '') + '%');
    const { data: people } = await pq;
    const { data: myFr } = await supabase.from('friendships').select('user_id, friend_id, status').or('user_id.eq.' + me + ',friend_id.eq.' + me);
    var fmap = {};
    (myFr || []).forEach(f => {
      const other = f.user_id === me ? f.friend_id : f.user_id;
      if (f.status === 'accepted') fmap[other] = 'accepted';
      else if (!fmap[other]) fmap[other] = (f.user_id === me ? 'pending_out' : 'pending_in');
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ people: (people || []).map(p => ({ id: p.id, display_name: p.display_name, avatar_url: p.avatar_url, user_id: p.user_id, friendship: fmap[p.id] || 'none' })) }));
    return;
  }

  // ── API: friends (accepted + pending both ways) ────────────────
  if (url.pathname === '/api/friends' && req.method === 'GET') {
    cors(res);
    const user = await requireUser(req, res); if (!user) return;
    const me = user.id;
    const { data: rows } = await supabase.from('friendships').select('user_id, friend_id, status, created_at').or('user_id.eq.' + me + ',friend_id.eq.' + me);
    const ids = [...new Set((rows || []).map(f => (f.user_id === me ? f.friend_id : f.user_id)))];
    var byId = {};
    if (ids.length) {
      const { data: us } = await supabase.from('users').select('id, display_name, avatar_url, user_id').in('id', ids);
      (us || []).forEach(u => { byId[u.id] = u; });
    }
    var friends = [], incoming = [], outgoing = [];
    var seen = {};
    (rows || []).forEach(f => {
      const other = f.user_id === me ? f.friend_id : f.user_id;
      const u = byId[other];
      if (!u) return;
      const entry = { id: u.id, display_name: u.display_name, avatar_url: u.avatar_url, user_id: u.user_id, since: f.created_at };
      if (f.status === 'accepted') { if (!seen[other]) { seen[other] = 1; friends.push(entry); } }
      else if (f.user_id === me) outgoing.push(entry);
      else incoming.push(entry);
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ friends, incoming, outgoing }));
    return;
  }

  // ── API: request a friend ──────────────────────────────────────
  if (url.pathname === '/api/friends' && req.method === 'POST') {
    cors(res);
    const user = await requireUser(req, res); if (!user) return;
    const me = user.id;
    const body = await readBody(req).catch(() => ({}));
    const targetId = String(body.userId || '').trim();
    if (!isUuid(targetId) || targetId === me) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Invalid user.' })); return; }
    const { data: target } = await supabase.from('users').select('id').eq('id', targetId).single();
    if (!target) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'User not found.' })); return; }
    const { data: mine } = await supabase.from('friendships').select('status').eq('user_id', me).eq('friend_id', targetId).single();
    const { data: theirs } = await supabase.from('friendships').select('status').eq('user_id', targetId).eq('friend_id', me).single();
    if (mine || theirs) {
      if (theirs && theirs.status === 'pending' && !mine) {
        // They already asked: accept on the spot instead of deadlocking.
        await supabase.from('friendships').update({ status: 'accepted' }).eq('user_id', targetId).eq('friend_id', me);
        await supabase.from('friendships').upsert({ user_id: me, friend_id: targetId, status: 'accepted' }, { onConflict: 'user_id,friend_id' });
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ status: 'accepted' })); return;
      }
      res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Already friends or requested.' })); return;
    }
    await supabase.from('friendships').insert({ user_id: me, friend_id: targetId, status: 'pending' });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'pending' }));
    return;
  }

  // ── API: accept / decline a friend request ─────────────────────
  if (url.pathname.startsWith('/api/friends/') && (req.method === 'POST') && (url.pathname.endsWith('/accept') || url.pathname.endsWith('/decline'))) {
    cors(res);
    const user = await requireUser(req, res); if (!user) return;
    const me = user.id;
    const parts = url.pathname.split('/');
    const otherId = parts[3];
    const accept = url.pathname.endsWith('/accept');
    if (!isUuid(otherId)) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Invalid user.' })); return; }
    const { data: req1 } = await supabase.from('friendships').select('user_id').eq('user_id', otherId).eq('friend_id', me).eq('status', 'pending').single();
    if (!req1) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'No pending request.' })); return; }
    if (accept) {
      await supabase.from('friendships').update({ status: 'accepted' }).eq('user_id', otherId).eq('friend_id', me);
      await supabase.from('friendships').upsert({ user_id: me, friend_id: otherId, status: 'accepted' }, { onConflict: 'user_id,friend_id' });
    } else {
      await supabase.from('friendships').delete().eq('user_id', otherId).eq('friend_id', me);
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // ── API: remove a friend ───────────────────────────────────────
  if (url.pathname.startsWith('/api/friends/') && req.method === 'DELETE') {
    cors(res);
    const user = await requireUser(req, res); if (!user) return;
    const me = user.id;
    const otherId = url.pathname.split('/')[3];
    if (!isUuid(otherId)) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Invalid user.' })); return; }
    await supabase.from('friendships').delete().eq('user_id', me).eq('friend_id', otherId);
    await supabase.from('friendships').delete().eq('user_id', otherId).eq('friend_id', me);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // ── API: open a DM (any signed-in user) ────────────────────────
  if (url.pathname === '/api/dm' && req.method === 'POST') {
    cors(res);
    const user = await requireUser(req, res); if (!user) return;
    const me = user.id;
    const body = await readBody(req).catch(() => ({}));
    const targetId = String(body.userId || '').trim();
    if (!isUuid(targetId) || targetId === me) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Invalid user.' })); return; }
    const { data: target } = await supabase.from('users').select('id').eq('id', targetId).single();
    if (!target) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'User not found.' })); return; }
    // Open DMs: any signed-in user can message anyone. (Friendship is
    // social, not a gate. Block/mute is the follow-up for abuse.)
    const name = dmRoomName(me, targetId);
    let { data: lobby } = await supabase.from('lobbies').select('id, name').eq('name', name).single();
    if (!lobby) {
      const { data: created } = await supabase.from('lobbies').insert({ name, kind: 'dm', is_private: true, created_by: me }).select('id, name').single();
      lobby = created;
    }
    if (!lobby) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Could not open conversation.' })); return; }
    await supabase.from('conversation_members').upsert([{ user_id: me, lobby_id: lobby.id }, { user_id: targetId, lobby_id: lobby.id }], { onConflict: 'user_id,lobby_id' });
    sendConversationsDirty();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id: lobby.id, name: lobby.name }));
    return;
  }

  // ── API: list a server's channels ──────────────────────────────
  if (url.pathname.startsWith('/api/servers/') && url.pathname.endsWith('/channels') && (req.method === 'GET' || req.method === 'POST')) {
    cors(res);
    const user = await requireUser(req, res); if (!user) return;
    const me = user.id;
    const sid = url.pathname.split('/')[3];
    if (!isUuid(sid)) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Invalid server.' })); return; }
    const { server, role } = await serverRole(me, sid);
    if (!server) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Server not found.' })); return; }
    if (req.method === 'GET') {
      if (server.visibility !== 'public' && !role) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Join this server first.' })); return; }
      let q = supabase.from('lobbies').select('id, name, topic, is_private, created_at').eq('kind', 'channel').eq('server_id', sid).order('created_at', { ascending: true });
      const { data } = await q;
      var chans = data || [];
      if (role !== 'owner') {
        const { data: mine } = await supabase.from('conversation_members').select('lobby_id').eq('user_id', me);
        var mineSet = {};
        (mine || []).forEach(r => { mineSet[r.lobby_id] = 1; });
        chans = chans.filter(c => !c.is_private || mineSet[c.id]);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ channels: chans.map(c => ({ id: c.id, name: c.name, slug: c.name.split(':').pop(), display: chanDisplay(c.name), topic: c.topic || '', is_private: !!c.is_private, created_at: c.created_at })) }));
      return;
    }
    // POST: create channel (owner only)
    if (role !== 'owner') { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Only the server owner can add channels.' })); return; }
    const body = await readBody(req).catch(() => ({}));
    const slug = chanSlug(body.name);
    if (slug.length < 2) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Channel name 2-30 chars (letters, numbers, -, _).' })); return; }
    const { data, error } = await supabase.from('lobbies').insert({ name: chanRoomName(sid, slug), kind: 'channel', server_id: sid, topic: String(body.topic || '').substring(0, 200), is_private: !!body.is_private, created_by: me }).select('id, name').single();
    if (error) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Channel exists.' })); return; }
    sendConversationsDirty();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ channel: data }));
    return;
  }

  // ── API: edit a channel (owner only) ───────────────────────────
  if (url.pathname.startsWith('/api/channels/') && req.method === 'PATCH' && url.pathname.split('/').length === 4) {
    cors(res);
    const user = await requireUser(req, res); if (!user) return;
    const me = user.id;
    const cid = url.pathname.split('/')[3];
    if (!isUuid(cid)) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Invalid channel.' })); return; }
    const { data: lobby } = await supabase.from('lobbies').select('id, name, kind, server_id').eq('id', cid).single();
    if (!lobby || lobby.kind !== 'channel') { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Channel not found.' })); return; }
    const { role } = await serverRole(me, lobby.server_id);
    if (role !== 'owner') { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Only the server owner can edit channels.' })); return; }
    const body = await readBody(req).catch(() => ({}));
    var updates = {};
    if (body.name !== undefined) {
      const slug = chanSlug(body.name);
      if (slug.length < 2) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Channel name 2-30 chars (letters, numbers, -, _).' })); return; }
      updates.name = chanRoomName(lobby.server_id, slug);
    }
    if (body.topic !== undefined) updates.topic = String(body.topic || '').substring(0, 200);
    if (body.is_private !== undefined) updates.is_private = !!body.is_private;
    if (!Object.keys(updates).length) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Nothing to update.' })); return; }
    const { data, error } = await supabase.from('lobbies').update(updates).eq('id', cid).select('id, name').single();
    if (error) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Channel exists.' })); return; }
    sendConversationsDirty();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ channel: data }));
    return;
  }

  // ── API: private-channel membership (owner only) ────────────────
  if (url.pathname.startsWith('/api/channels/') && url.pathname.split('/')[4] === 'members' && (req.method === 'POST' || req.method === 'DELETE')) {
    cors(res);
    const user = await requireUser(req, res); if (!user) return;
    const me = user.id;
    const parts = url.pathname.split('/');
    const cid = parts[3];
    if (!isUuid(cid)) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Invalid channel.' })); return; }
    const { data: lobby } = await supabase.from('lobbies').select('id, kind, server_id').eq('id', cid).single();
    if (!lobby || lobby.kind !== 'channel') { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Channel not found.' })); return; }
    const { role } = await serverRole(me, lobby.server_id);
    if (role !== 'owner') { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Only the server owner can manage members.' })); return; }
    var targetId;
    if (req.method === 'POST') {
      const body = await readBody(req).catch(() => ({}));
      targetId = String(body.userId || '').trim();
    } else {
      targetId = String(parts[5] || '').trim();
    }
    if (!isUuid(targetId)) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Invalid user.' })); return; }
    if (req.method === 'POST') {
      const { role: tr } = await serverRole(targetId, lobby.server_id);
      if (!tr) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'They must join the server first.' })); return; }
      await supabase.from('conversation_members').upsert({ user_id: targetId, lobby_id: cid }, { onConflict: 'user_id,lobby_id' });
    } else {
      await supabase.from('conversation_members').delete().eq('user_id', targetId).eq('lobby_id', cid);
    }
    sendConversationsDirty();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // ── API: mark a conversation read ─────────────────────────────
  if (url.pathname.startsWith('/api/conversations/') && url.pathname.endsWith('/read') && req.method === 'POST') {
    cors(res);
    const user = await requireUser(req, res); if (!user) return;
    const me = user.id;
    const cid = url.pathname.split('/')[3];
    if (!isUuid(cid)) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Invalid conversation.' })); return; }
    const { data: lobby } = await supabase.from('lobbies').select('id, name, kind, server_id, is_private').eq('id', cid).single();
    if (!lobby || !(await canSeeLobby(me, lobby))) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Not found.' })); return; }
    await supabase.from('conversation_state').upsert({ user_id: me, lobby_id: cid, last_read_at: new Date().toISOString() }, { onConflict: 'user_id,lobby_id' });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // ── API: peer read state (DMs only) ──────────────────────────
  // Returns the other participant's last_read_at so own messages can
  // render sent (✓) vs seen (✓✓). Only visible to DM participants.
  if (url.pathname.startsWith('/api/conversations/') && url.pathname.endsWith('/peer') && req.method === 'GET') {
    cors(res);
    const user = await requireUser(req, res); if (!user) return;
    const me = user.id;
    const cid = url.pathname.split('/')[3];
    if (!isUuid(cid)) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Invalid conversation.' })); return; }
    const { data: lobby } = await supabase.from('lobbies').select('id, name, kind').eq('id', cid).single();
    if (!lobby || lobby.kind !== 'dm' || !(await canSeeLobby(me, lobby))) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found.' }));
      return;
    }
    const { data: parts } = await supabase.from('conversation_members').select('user_id').eq('lobby_id', cid).neq('user_id', me).limit(1);
    const peerId = parts && parts[0] && parts[0].user_id;
    var lastRead = null;
    if (peerId) {
      const { data: st } = await supabase.from('conversation_state').select('last_read_at').eq('user_id', peerId).eq('lobby_id', cid).single();
      if (st) lastRead = st.last_read_at;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ last_read_at: lastRead }));
    return;
  }

  // ── Virtual coins: balance, quests, daily, trickle ─────────────
  // Play money only (no cash-out). Every movement lands in coin_ledger
  // through the atomic grant/spend RPCs; quest and daily claims check
  // the ledger first, and a partial unique index backs the once-only
  // rule against double-clicks from two tabs.
  var QUESTS = {
    publish_first:     { coins: 100, label: 'Publish your first game' },
    first_dm:          { coins: 25,  label: 'Send your first DM' },
    profile_complete:  { coins: 25,  label: 'Complete your profile' },
    join_first_server: { coins: 25,  label: 'Join your first server' },
    first_friend:      { coins: 25,  label: 'Add your first friend' },
  };
  async function coinBalance(me) {
    const { data } = await supabase.from('users').select('balance').eq('id', me).single();
    return (data && data.balance) || 0;
  }
  async function earnCount(me, reason) {
    const { count } = await supabase.from('coin_ledger').select('id', { count: 'exact', head: true }).eq('user_id', me).eq('reason', reason);
    return count || 0;
  }

  // ── API: coin balance + recent receipts ────────────────────────
  if (url.pathname === '/api/coins' && req.method === 'GET') {
    cors(res);
    const user = await requireUser(req, res); if (!user) return;
    const { data: rows } = await supabase.from('coin_ledger').select('delta, reason, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ balance: await coinBalance(user.id), receipts: rows || [] }));
    return;
  }

  // ── API: quest list (done state read from the ledger) ─────────
  if (url.pathname === '/api/quests' && req.method === 'GET') {
    cors(res);
    const user = await requireUser(req, res); if (!user) return;
    const { data: rows } = await supabase.from('coin_ledger').select('reason').eq('user_id', user.id).like('reason', 'quest:%');
    const done = {};
    (rows || []).forEach(r => { done[String(r.reason).slice(6)] = true; });
    const quests = Object.keys(QUESTS).map(k => ({ id: k, label: QUESTS[k].label, coins: QUESTS[k].coins, done: !!done[k] }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ quests }));
    return;
  }

  // ── API: claim a quest (verifies the deed, once-only) ─────────
  if (url.pathname === '/api/quests/claim' && req.method === 'POST') {
    cors(res);
    const user = await requireUser(req, res); if (!user) return;
    const me = user.id;
    const body = await readBody(req).catch(() => ({}));
    const q = QUESTS[body && body.quest];
    if (!q) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Unknown quest.' })); return; }
    if (await earnCount(me, 'quest:' + body.quest)) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, already: true, balance: await coinBalance(me) }));
      return;
    }
    var earned = false;
    if (body.quest === 'publish_first') {
      const { count } = await supabase.from('games').select('id', { count: 'exact', head: true }).eq('owner_id', me).eq('published', true);
      earned = (count || 0) > 0;
    } else if (body.quest === 'first_dm') {
      const { data: dmRows } = await supabase.from('conversation_members').select('lobby_id, lobbies!inner(kind)').eq('user_id', me).eq('lobbies.kind', 'dm');
      if (dmRows && dmRows.length) {
        const { count } = await supabase.from('messages').select('id', { count: 'exact', head: true }).eq('user_id', me).in('lobby_id', dmRows.map(r => r.lobby_id));
        earned = (count || 0) > 0;
      }
    } else if (body.quest === 'profile_complete') {
      const { data: prof } = await supabase.from('users').select('display_name, avatar_url').eq('id', me).single();
      earned = !!(prof && prof.display_name && prof.avatar_url);
    } else if (body.quest === 'join_first_server') {
      const { count: m } = await supabase.from('server_members').select('server_id', { count: 'exact', head: true }).eq('user_id', me);
      const { count: o } = await supabase.from('servers').select('id', { count: 'exact', head: true }).eq('owner_id', me);
      earned = ((m || 0) + (o || 0)) > 0;
    } else if (body.quest === 'first_friend') {
      const { count } = await supabase.from('friendships').select('user_id', { count: 'exact', head: true }).eq('status', 'accepted').or('user_id.eq.' + me + ',friend_id.eq.' + me);
      earned = (count || 0) > 0;
    }
    if (!earned) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Quest not completed yet.' })); return; }
    try {
      const { data: bal, error } = await supabase.rpc('grant_coins', { p_user: me, p_delta: q.coins, p_reason: 'quest:' + body.quest, p_ref: null });
      if (error) throw error;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, balance: bal }));
    } catch (e) {
      if (String((e && e.message) || '').includes('duplicate key')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, already: true, balance: await coinBalance(me) }));
        return;
      }
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Claim failed.' }));
    }
    return;
  }

  // ── API: daily login claim (10 coins, once per UTC day) ────────
  if (url.pathname === '/api/daily/claim' && req.method === 'POST') {
    cors(res);
    const user = await requireUser(req, res); if (!user) return;
    const me = user.id;
    const reason = 'daily:' + new Date().toISOString().slice(0, 10);
    if (await earnCount(me, reason)) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, already: true, balance: await coinBalance(me) }));
      return;
    }
    try {
      const { data: bal, error } = await supabase.rpc('grant_coins', { p_user: me, p_delta: 10, p_reason: reason, p_ref: null });
      if (error) throw error;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, balance: bal }));
    } catch (e) {
      if (String((e && e.message) || '').includes('duplicate key')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, already: true, balance: await coinBalance(me) }));
        return;
      }
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Claim failed.' }));
    }
    return;
  }

  // ── Community theme packs ─────────────────────────────────────
  // Manifests are pure data (see theme-engine.js): the server validates
  // every field against the engine's allowlists and serves manifests
  // only to entitled users — that gate is the purchase enforcement.
  var PACK_FONTS = ['Inter', 'Space Grotesk', 'Sora', 'Manrope', 'Outfit', 'DM Sans', 'JetBrains Mono'];
  var PACK_SCENES = ['city-night', 'ember-field'];
  var PACK_COLOR_KEYS = ['ink', 'panel', 'raised', 'line', 'signal', 'tp', 'ts', 'tt'];
  var RESERVED_PACK_SLUGS = ['anime-city-night'];
  try {
    const idx = JSON.parse(fs.readFileSync('public/packs/index.json', 'utf8'));
    (idx.packs || []).forEach(p => { if (p.slug) RESERVED_PACK_SLUGS.push(p.slug); });
  } catch {}
  function validatePack(name, description, price, m) {
    if (!name || String(name).trim().length < 2 || String(name).trim().length > 40) return 'Pack name must be 2–40 characters.';
    if (String(description || '').length > 500) return 'Description is too long (500 max).';
    if (!Number.isInteger(price) || price < 0 || price > 100000) return 'Price must be 0–100000 coins.';
    if (!m || typeof m !== 'object' || Array.isArray(m)) return 'Invalid manifest.';
    const top = ['colors', 'fonts', 'background', 'icons', 'motion', 'radius', 'tags', 'sidebar'];
    for (const k of Object.keys(m)) if (!top.includes(k)) return 'Unknown manifest section: ' + k + '.';
    const c = m.colors || {};
    if (typeof c !== 'object') return 'Invalid colors.';
    for (const k of Object.keys(c)) {
      if (!PACK_COLOR_KEYS.includes(k)) return 'Unknown color: ' + k + '.';
      if (!/^#[0-9a-fA-F]{6}$/.test(String(c[k]))) return 'Color ' + k + ' must be #rrggbb.';
    }
    if (m.fonts !== undefined) {
      if (!m.fonts || typeof m.fonts !== 'object') return 'Invalid fonts.';
      if (m.fonts.head !== undefined && !PACK_FONTS.includes(m.fonts.head)) return 'Unknown head font.';
      if (m.fonts.body !== undefined && !PACK_FONTS.includes(m.fonts.body)) return 'Unknown body font.';
    }
    if (m.background !== undefined) {
      const bg = m.background;
      if (!bg || typeof bg !== 'object') return 'Invalid background.';
      if (!['none', 'image', 'scene'].includes(bg.type)) return 'Unknown background type.';
      if (bg.type === 'scene' && !PACK_SCENES.includes(bg.scene)) return 'Unknown scene.';
      if (bg.type === 'image' && (typeof bg.src !== 'string' || !bg.src.startsWith('https://') || bg.src.length > 500)) return 'Background image must be an https URL.';
      if (bg.opacity !== undefined && (typeof bg.opacity !== 'number' || bg.opacity < 0 || bg.opacity > 1)) return 'Opacity must be 0–1.';
      if (bg.params !== undefined) {
        if (!bg.params || typeof bg.params !== 'object') return 'Invalid scene params.';
        const ks = Object.keys(bg.params);
        if (ks.length > 8) return 'Too many scene params.';
        for (const k of ks) if (typeof bg.params[k] !== 'number') return 'Scene params must be numbers.';
      }
    }
    if (m.icons !== undefined && !['default', 'neon'].includes(m.icons)) return 'Unknown icon set.';
    if (m.motion !== undefined) {
      if (!m.motion || typeof m.motion !== 'object') return 'Invalid motion.';
      if (m.motion.preset !== undefined && !['calm', 'playful'].includes(m.motion.preset)) return 'Unknown motion preset.';
    }
    if (m.radius !== undefined && (!Number.isInteger(m.radius) || m.radius < 0 || m.radius > 24)) return 'Radius must be 0–24.';
    if (m.tags !== undefined) {
      if (!Array.isArray(m.tags) || m.tags.length > 8) return 'Up to 8 tags.';
      for (const t of m.tags) if (typeof t !== 'string' || !t.trim() || t.length > 24) return 'Tags must be short text.';
    }
    if (m.sidebar !== undefined) {
      if (!m.sidebar || typeof m.sidebar !== 'object') return 'Invalid sidebar.';
      if (m.sidebar.background !== undefined && (typeof m.sidebar.background !== 'string' || !m.sidebar.background.startsWith('https://') || m.sidebar.background.length > 500)) return 'Sidebar background must be an https URL.';
    }
    return null;
  }
  function packSlug(name) {
    const base = String(name).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').substring(0, 24) || 'pack';
    return base + '-' + Math.random().toString(36).slice(2, 6);
  }
  async function packByKey(key) {
    const sel = 'id, slug, name, description, manifest, price, downloads, featured, published, owner_id, created_at';
    const q = isUuid(key)
      ? supabase.from('theme_packs').select(sel).eq('id', key)
      : supabase.from('theme_packs').select(sel).eq('slug', key);
    const { data } = await q.single();
    return data || null;
  }
  async function ownsPack(me, packId) {
    if (!me) return false;
    const { data } = await supabase.from('pack_ownership').select('pack_id').eq('user_id', me).eq('pack_id', packId).single();
    return !!data;
  }

  // ── API: list published packs (public; owned flag when signed in)
  // ?mine=1 returns the caller's own packs, drafts included.
  if (url.pathname === '/api/packs' && req.method === 'GET') {
    cors(res);
    const t = (req.headers.authorization || '').replace('Bearer ', '');
    var me = null;
    if (t) { const { data: { user } } = await supabase.auth.getUser(t); if (user) me = user.id; }
    const mineOnly = url.searchParams.get('mine') === '1';
    if (mineOnly && !me) { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Sign in required.' })); return; }
    var pq = supabase.from('theme_packs').select('id, slug, name, description, price, downloads, featured, published, owner_id, created_at');
    pq = mineOnly ? pq.eq('owner_id', me) : pq.eq('published', true);
    const { data: packs } = await pq.order('featured', { ascending: false }).order('created_at', { ascending: false }).limit(100);
    var owned = {};
    if (me && packs && packs.length) {
      const { data: rows } = await supabase.from('pack_ownership').select('pack_id').eq('user_id', me).in('pack_id', packs.map(p => p.id));
      (rows || []).forEach(r => { owned[r.pack_id] = true; });
    }
    var authorById = {};
    const ownerIds = [...new Set((packs || []).map(p => p.owner_id))];
    if (ownerIds.length) {
      const { data: users } = await supabase.from('users').select('id, display_name').in('id', ownerIds);
      (users || []).forEach(u => { authorById[u.id] = u.display_name; });
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ packs: (packs || []).map(p => ({
      id: p.id, slug: p.slug, name: p.name, description: p.description,
      price: p.price, downloads: p.downloads, featured: p.featured,
      published: p.published,
      author: authorById[p.owner_id] || 'unknown',
      mine: me === p.owner_id,
      owned: p.price === 0 || me === p.owner_id || !!owned[p.id],
    })) }));
    return;
  }

  // ── API: fetch a pack manifest (gated: free, owned, or owner) ──
  if (url.pathname.startsWith('/api/packs/') && url.pathname.endsWith('/manifest') && req.method === 'GET') {
    cors(res);
    const key = decodeURIComponent(url.pathname.split('/')[3] || '');
    const pack = await packByKey(key);
    if (!pack || !pack.published) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Pack not found.' })); return; }
    const t = (req.headers.authorization || '').replace('Bearer ', '');
    var me = null;
    if (t) { const { data: { user } } = await supabase.auth.getUser(t); if (user) me = user.id; }
    const entitled = pack.price === 0 || me === pack.owner_id || await ownsPack(me, pack.id);
    if (!entitled) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'This pack costs ' + pack.price + ' coins.', price: pack.price })); return; }
    if (url.searchParams.get('install') === '1') {
      await supabase.from('theme_packs').update({ downloads: (pack.downloads || 0) + 1 }).eq('id', pack.id);
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ slug: pack.slug, name: pack.name, description: pack.description, manifest: pack.manifest, price: pack.price }));
    return;
  }

  // ── API: create a pack (draft or published) ────────────────────
  if (url.pathname === '/api/packs' && req.method === 'POST') {
    cors(res);
    const user = await requireUser(req, res); if (!user) return;
    const body = await readBody(req).catch(() => ({}));
    const price = body.price === undefined ? 0 : body.price;
    const err = validatePack(body.name, body.description || '', price, body.manifest);
    if (err) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: err })); return; }
    var slug = packSlug(body.name);
    for (let i = 0; i < 3; i++) {
      if (RESERVED_PACK_SLUGS.includes(slug)) { slug = packSlug(body.name); continue; }
      const { data: clash } = await supabase.from('theme_packs').select('id').eq('slug', slug).single();
      if (!clash) break;
      slug = packSlug(body.name);
    }
    if (RESERVED_PACK_SLUGS.includes(slug)) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Try a different name.' })); return; }
    const { data: pack, error } = await supabase.from('theme_packs').insert({
      slug, owner_id: user.id,
      name: String(body.name).trim(),
      description: String(body.description || '').trim().substring(0, 500),
      manifest: body.manifest, price, published: !!body.published,
    }).select('id, slug, name, description, price, published').single();
    if (error) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Create failed.' })); return; }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ pack }));
    return;
  }

  // ── API: update a pack (owner only) ────────────────────────────
  if (url.pathname.startsWith('/api/packs/') && !url.pathname.endsWith('/manifest') && !url.pathname.endsWith('/buy') && req.method === 'PATCH') {
    cors(res);
    const user = await requireUser(req, res); if (!user) return;
    const key = decodeURIComponent(url.pathname.split('/')[3] || '');
    const pack = await packByKey(key);
    if (!pack || pack.owner_id !== user.id) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Pack not found.' })); return; }
    const body = await readBody(req).catch(() => ({}));
    const name = body.name === undefined ? pack.name : body.name;
    const description = body.description === undefined ? pack.description : body.description;
    const price = body.price === undefined ? pack.price : body.price;
    const manifest = body.manifest === undefined ? pack.manifest : body.manifest;
    const err = validatePack(name, description, price, manifest);
    if (err) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: err })); return; }
    const updates = {
      name: String(name).trim(),
      description: String(description || '').trim().substring(0, 500),
      manifest, price, updated_at: new Date().toISOString(),
    };
    if (body.published !== undefined) updates.published = !!body.published;
    const { error } = await supabase.from('theme_packs').update(updates).eq('id', pack.id);
    if (error) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Update failed.' })); return; }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // ── API: delete a pack (owner only; ownership rows cascade) ───
  if (url.pathname.startsWith('/api/packs/') && !url.pathname.endsWith('/manifest') && !url.pathname.endsWith('/buy') && req.method === 'DELETE') {
    cors(res);
    const user = await requireUser(req, res); if (!user) return;
    const key = decodeURIComponent(url.pathname.split('/')[3] || '');
    const pack = await packByKey(key);
    if (!pack || pack.owner_id !== user.id) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Pack not found.' })); return; }
    await supabase.from('theme_packs').delete().eq('id', pack.id);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // ── API: buy a pack (buyer pays, creator gets 100%) ────────────
  if (url.pathname.startsWith('/api/packs/') && url.pathname.endsWith('/buy') && req.method === 'POST') {
    cors(res);
    const user = await requireUser(req, res); if (!user) return;
    const me = user.id;
    const key = decodeURIComponent(url.pathname.split('/')[3] || '');
    const pack = await packByKey(key);
    if (!pack || !pack.published) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Pack not found.' })); return; }
    if (pack.owner_id === me) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'You own this pack.' })); return; }
    if (pack.price === 0 || await ownsPack(me, pack.id)) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, already: true, manifest: pack.manifest, slug: pack.slug }));
      return;
    }
    // Claim ownership first: a concurrent second buy hits the PK and
    // gets the manifest free instead of charging twice.
    const { error: ownErr } = await supabase.from('pack_ownership').insert({ user_id: me, pack_id: pack.id });
    if (ownErr) {
      if (String(ownErr.message || '').includes('duplicate key')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, already: true, manifest: pack.manifest, slug: pack.slug }));
        return;
      }
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Buy failed.' }));
      return;
    }
    const { data: bal, error: spendErr } = await supabase.rpc('spend_coins', { p_user: me, p_delta: pack.price, p_reason: 'pack_buy', p_ref: pack.id });
    if (spendErr) {
      await supabase.from('pack_ownership').delete().eq('user_id', me).eq('pack_id', pack.id);
      const short = String(spendErr.message || '').includes('insufficient funds');
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(short ? { error: 'Not enough coins.', need: pack.price - (await coinBalance(me)) } : { error: 'Buy failed.' }));
      return;
    }
    const { error: grantErr } = await supabase.rpc('grant_coins', { p_user: pack.owner_id, p_delta: pack.price, p_reason: 'pack_sale', p_ref: pack.id });
    if (grantErr) {
      await supabase.rpc('grant_coins', { p_user: me, p_delta: pack.price, p_reason: 'pack_refund', p_ref: pack.id });
      await supabase.from('pack_ownership').delete().eq('user_id', me).eq('pack_id', pack.id);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Buy failed.' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, manifest: pack.manifest, slug: pack.slug, balance: bal }));
    return;
  }

  // ── API: file a report (reason required, picture optional) ────
  // Evidence uploads go to the private report-evidence bucket; the client
  // sends the storage path (not a URL) and review happens in the dashboard.
  var REPORT_REASONS = ['inappropriate', 'stolen', 'broken', 'spam', 'other'];
  if (url.pathname === '/api/reports' && req.method === 'POST') {
    cors(res);
    const user = await requireUser(req, res); if (!user) return;
    const body = await readBody(req).catch(() => ({}));
    if (body.content_type !== 'pack') { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Unknown content.' })); return; }
    if (!REPORT_REASONS.includes(body.reason)) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Pick a reason.' })); return; }
    const details = String(body.details || '').trim().substring(0, 1000);
    var contentId = null, contentSlug = null;
    if (body.content_id && isUuid(body.content_id)) {
      const pack = await packByKey(body.content_id);
      if (!pack || !pack.published) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Pack not found.' })); return; }
      contentId = pack.id;
    } else if (body.content_slug && typeof body.content_slug === 'string') {
      const slug = body.content_slug.substring(0, 60);
      const known = RESERVED_PACK_SLUGS.includes(slug) || await packByKey(slug);
      if (!known) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Pack not found.' })); return; }
      contentSlug = slug;
    } else {
      res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Unknown pack.' })); return;
    }
    var evidencePath = null;
    if (body.evidence_path) {
      if (typeof body.evidence_path !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9/_.-]{0,199}$/.test(body.evidence_path)) {
        res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Bad evidence file.' })); return;
      }
      evidencePath = body.evidence_path;
    }
    const { error } = await supabase.from('reports').insert({
      reporter_id: user.id, content_type: 'pack',
      content_id: contentId, content_slug: contentSlug,
      reason: body.reason, details, evidence_url: evidencePath, status: 'open',
    });
    if (error) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Report failed.' })); return; }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
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

  // ── API: my games (Studio "Your Projects" tab) ───────────────────
  if (url.pathname === '/api/games/mine' && req.method === 'GET') {
    cors(res);
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) { res.writeHead(401); res.end(); return; }
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) { res.writeHead(401); res.end(); return; }
    const { data } = await supabase.from('games').select('id, title, description, thumbnail, published, created_at, updated_at').eq('owner_id', user.id).order('updated_at', { ascending: false });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ games: data || [] }));
    return;
  }

  // ── API: AI fetch proxy (Cudic AI panel) ────────────────────────
  // Browsers block cross-origin calls to most LLM providers (no CORS), so
  // the Studio panel routes cloud calls through here. Login required (no
  // open relay); only whitelisted AI hosts, https only, loopback rejected
  // (local engines like Ollama are called direct from the browser).
  const AI_HOSTS = new Set([
    'api.openai.com', 'api.anthropic.com', 'generativelanguage.googleapis.com',
    'api.x.ai', 'api.deepseek.com', 'api.mistral.ai', 'api.groq.com',
    'api.together.xyz', 'api.fireworks.ai', 'api.cerebras.ai', 'api.deepinfra.com',
    'api.cohere.com', 'api.perplexity.ai', 'api.minimax.io', 'api.moonshot.ai',
    'api.zhipu.ai', 'open.bigmodel.cn', 'dashscope.aliyuncs.com', 'api.stepfun.com',
    'api.01.ai', 'api.sarvam.ai', 'api.upstage.ai', 'api.ai21.com', 'api.writer.com',
    'api.hyperbolic.xyz', 'api.nebius.ai', 'api.sambanova.ai', 'api.novita.ai',
    'siliconflow.cn', 'api.siliconflow.cn', 'api.infermatic.ai', 'api.kluster.ai',
    'api.chutes.ai', 'llm.chutes.ai', 'api.featherless.ai', 'api.targon.com', 'api.friendli.ai',
    'api.nscale.com', 'api.parasail.io', 'api.lambda.ai', 'api.endpoints.anyscale.com',
    'api.baseten.co', 'api.cloudflare.com', 'api.venice.ai', 'api.z.ai',
    'api.hunyuan.cloud.tencent.com', 'qianfan.baidubce.com', 'openrouter.ai',
    'opencode.ai', 'api.aimlapi.com', 'api.zeroone.ai'
  ]);
  if (url.pathname === '/api/ai/fetch' && req.method === 'POST') {
    cors(res);
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Sign in to use cloud models.' })); return; }
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Sign in to use cloud models.' })); return; }
    const body = await readBody(req);
    let target;
    try { target = new URL(String(body.url || '')); } catch { target = null; }
    const hostOk = target && target.protocol === 'https:' &&
      (AI_HOSTS.has(target.hostname) || target.hostname.endsWith('.openai.azure.com'));
    const loopback = target && /^(localhost|127\.|0\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1|fc00:|fe80:)/i.test(target.hostname);
    if (!hostOk || loopback) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Target not allowed.' })); return; }
    const fwdHeaders = {};
    for (const [k, v] of Object.entries(body.headers || {})) {
      if (typeof v === 'string' && v.length < 8192 &&
        /^(authorization|content-type|x-api-key|x-goog-api-key|anthropic-version|openai-organization|openai-project|http-referer|x-title)$/i.test(k)) fwdHeaders[k] = v;
    }
    let upstream;
    try {
      upstream = await fetch(target.toString(), {
        method: body.method === 'GET' ? 'GET' : 'POST',
        headers: fwdHeaders,
        body: body.method === 'GET' ? undefined : (typeof body.body === 'string' ? body.body : JSON.stringify(body.body ?? {}))
      });
    } catch (e) { res.writeHead(502, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Upstream unreachable.' })); return; }
    res.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') || 'application/json', 'Cache-Control': 'no-store' });
    try {
      for await (const chunk of upstream.body) { res.write(chunk); }
    } catch (e) {}
    res.end();
    return;
  }

  // ── API: list game comments ──────────────────────────────────
  if (/^\/api\/games\/[^/]+\/comments$/.test(url.pathname) && req.method === 'GET') {
    cors(res);
    const id = url.pathname.split('/')[3];
    const { data } = await supabase.from('game_comments').select('id, text, created_at, user_id, display_name').eq('game_id', id).order('created_at', { ascending: true }).limit(100);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ comments: data || [] }));
    return;
  }

  // ── API: post game comment ───────────────────────────────────
  if (/^\/api\/games\/[^/]+\/comments$/.test(url.pathname) && req.method === 'POST') {
    cors(res);
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
    const id = url.pathname.split('/')[3];
    const body = await readBody(req);
    const text = (body.text || '').trim().substring(0, 2000);
    if (!text) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Empty comment' })); return; }
    const { data: prof } = await supabase.from('users').select('display_name').eq('id', user.id).single();
    const { data, error } = await supabase.from('game_comments').insert({
      game_id: id,
      user_id: user.id,
      display_name: (prof && prof.display_name) || 'Unknown',
      text
    }).select().single();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ comment: data, error: error?.message }));
    return;
  }

  // ── API: game thumbnail as a real URL ────────────────────────
  // Stored as a data: URL (unusable by link scrapers); this serves real bytes.
  // Must stay above the generic /api/games/:id GET below, which would swallow it.
  if (/^\/api\/games\/[^/]+\/thumbnail$/.test(url.pathname) && req.method === 'GET') {
    cors(res);
    const id = url.pathname.split('/')[3];
    const { data } = await supabase.from('games').select('thumbnail').eq('id', id).single();
    const m = data && typeof data.thumbnail === 'string'
      ? /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(data.thumbnail) : null;
    if (!m) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); return; }
    const buf = Buffer.from(m[2], 'base64');
    res.writeHead(200, {
      'Content-Type': m[1],
      'Content-Length': buf.length,
      'Cache-Control': 'public, max-age=86400'
    });
    res.end(buf);
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
      assets: body.assets || null,
      thumbnail: body.thumbnail || null,
      published: body.published || false,
    }).select().single();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ game: data, error: error?.message }));
    return;
  }

  // ── API: fork game (copy row + storage objects, fresh discussion) ──
  if (/^\/api\/games\/[^/]+\/fork$/.test(url.pathname) && req.method === 'POST') {
    cors(res);
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
    const id = url.pathname.split('/')[3];
    const { data: g } = await supabase.from('games').select('*').eq('id', id).single();
    if (!g) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Not found' })); return; }
    if (!g.published && g.owner_id !== user.id) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Forbidden' })); return; }
    const { data: nu, error: insErr } = await supabase.from('games').insert({
      owner_id: user.id,
      title: (g.title || 'Untitled') + ' (fork)',
      description: g.description || '',
      credits: g.credits || '',
      scene: g.scene || '[]',
      files: g.files || null,
      assets: null,
      thumbnail: g.thumbnail || null,
      published: false
    }).select().single();
    if (insErr || !nu) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: insErr?.message || 'Fork failed' })); return; }
    // Copy storage objects old prefix -> new prefix (recursive), rewrite manifest.
    const bucket = supabase.storage.from('game-assets');
    async function walk(prefix, out) {
      const { data: entries } = await bucket.list(prefix, { limit: 1000 });
      for (const e of entries || []) {
        const p = prefix ? prefix + '/' + e.name : e.name;
        if (e.metadata) out.push(p);
        else await walk(p, out);
      }
    }
    try {
      const paths = [];
      await walk(id, paths);
      for (const from of paths) {
        const to = nu.id + from.substring(id.length);
        try {
          const { error: cpErr } = await bucket.copy(from, to);
          if (cpErr) throw cpErr;
        } catch {
          const { data: blob } = await bucket.download(from);
          if (blob) await bucket.upload(to, blob, { upsert: true });
        }
      }
      const manifest = g.assets || {};
      const rewritten = {};
      for (const [k, v] of Object.entries(manifest)) {
        const stripped = String(v).replace(/^game-assets\//, '');
        rewritten[k] = stripped.startsWith(id + '/')
          ? 'game-assets/' + nu.id + stripped.substring(id.length)
          : String(v);
      }
      if (Object.keys(rewritten).length) {
        await supabase.from('games').update({ assets: rewritten }).eq('id', nu.id);
        nu.assets = rewritten;
      }
    } catch {
      // storage copy is best-effort; text files already forked
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ game: nu }));
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
    if (body.assets !== undefined) updates.assets = body.assets;
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
    // Best-effort: purge the project's storage prefix so binaries don't orphan.
    try {
      const bucket = supabase.storage.from('game-assets');
      const paths = [];
      async function walk(prefix) {
        const { data: entries } = await bucket.list(prefix, { limit: 1000 });
        for (const e of entries || []) {
          const p = prefix ? prefix + '/' + e.name : e.name;
          if (e.metadata) paths.push(p);
          else await walk(p);
        }
      }
      await walk(id, paths);
      if (paths.length) await bucket.remove(paths);
    } catch {}
    await supabase.from('games').delete().eq('id', id).eq('owner_id', user.id);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // ── API: delete comment (author or game owner) ────────────────
  if (url.pathname.startsWith('/api/comments/') && req.method === 'DELETE') {
    cors(res);
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
    const cid = url.pathname.split('/')[3];
    const { data: c } = await supabase.from('game_comments').select('id, user_id, game_id').eq('id', cid).single();
    if (!c) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Not found' })); return; }
    let allowed = c.user_id === user.id;
    if (!allowed) {
      const { data: g } = await supabase.from('games').select('owner_id').eq('id', c.game_id).single();
      allowed = !!(g && g.owner_id === user.id);
    }
    if (!allowed) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Forbidden' })); return; }
    await supabase.from('game_comments').delete().eq('id', cid);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // ── Favicon (inline SVG — one route covers every page, no 404 noise) ──
  if (url.pathname === '/favicon.ico') {
    fs.readFile(path.join(__dirname, 'public', 'cudic_sfsvg.svg'), (err, data) => {
      if (err) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' });
      res.end(data);
    });
    return;
  }

  // ── Redirect /chat to /chat.html ───────────────────────────────
  if (url.pathname === '/chat') {
    url.pathname = '/chat.html';
  }

  // ── Redirect /login to the sign-in screen ─────────────────────
  if (url.pathname === '/login') {
    url.pathname = '/login.html';
  }

  // ── Redirect /profile to /profile.html ─────────────────────────
  if (url.pathname === '/profile') {
    url.pathname = '/profile.html';
  }

  // ── Phase 0: workbench scaffold (Vite build output, local-only for now)
  if (url.pathname === '/studio') {
    url.pathname = '/studio/index.html';
  }

  // ── Redirect /servers to /servers.html ─────────────────────────
  if (url.pathname === '/servers') {
    url.pathname = '/servers.html';
  }

  // ── /lobbies is gone: send everyone to chat ────────────────────
  if (url.pathname === '/lobbies') {
    res.writeHead(302, { Location: '/chat' });
    res.end();
    return;
  }

  // ── Redirect /games to /games.html ────────────────────────────
  if (url.pathname === '/games') {
    url.pathname = '/games.html';
  }

  // ── Redirect /themes to /themes.html ──────────────────────────
  if (url.pathname === '/themes') {
    url.pathname = '/themes.html';
  }

  // ── Redirect /editor to /editor.html ──────────────────────────
  if (url.pathname === '/editor') {
    url.pathname = '/editor.html';
  }

  // ── Redirect /music to /music.html ───────────────────────────
  if (url.pathname === '/music') {
    url.pathname = '/music.html';
  }

  let filePath = path.join(__dirname, 'public', url.pathname === '/' ? 'index.html' : url.pathname);
  const ext = path.extname(filePath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream' };
    if (ext === '.html') headers['Cache-Control'] = 'no-store';
    // Hashed studio bundles are content-addressed — safe to cache forever.
    // (index.html itself stays no-store: it points at the latest hashes.)
    if (ext !== '.html' && filePath.includes(`${path.sep}studio${path.sep}`)) {
      headers['Cache-Control'] = 'public, max-age=31536000, immutable';
    }
    res.writeHead(200, headers);
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
      // Activity trickle: first 10 messages each UTC day earn 1 coin.
      // Best-effort only — never blocks or breaks the save above.
      if (userId) {
        try {
          const dayStart = new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z';
          const { count } = await supabase.from('coin_ledger').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('reason', 'activity').gte('created_at', dayStart);
          if ((count || 0) < 10) await supabase.rpc('grant_coins', { p_user: userId, p_delta: 1, p_reason: 'activity', p_ref: null });
        } catch {}
      }
    }
  } catch (err) {
    console.error('Failed to save message:', err.message);
  }
}

// owner | member | null for a server (module scope: used by HTTP + WS)
async function serverRole(me, serverId) {
  const { data: srv } = await supabase.from('servers').select('id, visibility, owner_id, rules').eq('id', serverId).single();
  if (!srv) return { server: null, role: null };
  if (srv.owner_id === me) return { server: srv, role: 'owner' };
  const { data: m } = await supabase.from('server_members').select('role').eq('server_id', serverId).eq('user_id', me).single();
  return { server: srv, role: m ? m.role : null };
}

// can this user open this conversation? (module scope: used by HTTP + WS)
async function canSeeLobby(me, lobby) {
  if (!lobby) return false;
  if (lobby.kind === 'dm') {
    const { data } = await supabase.from('conversation_members').select('user_id').eq('lobby_id', lobby.id).eq('user_id', me).single();
    return !!data;
  }
  if (lobby.kind === 'channel') {
    const { server, role } = await serverRole(me, lobby.server_id);
    if (!server) return false;
    if (role === 'owner') return true;
    // Rules screening: members who haven't accepted see nothing until they do.
    if (server.rules) {
      const { data: mem } = await supabase.from('server_members').select('rules_accepted_at').eq('server_id', server.id).eq('user_id', me).single();
      if (!mem || !mem.rules_accepted_at) return false;
    }
    if (!lobby.is_private) {
      if (server.visibility === 'public') return true;
      return !!role;
    }
    const { data } = await supabase.from('conversation_members').select('user_id').eq('lobby_id', lobby.id).eq('user_id', me).single();
    return !!data;
  }
  return true;
}

// Does this user owe a rules-accept for this conversation's server?
// (module scope: lets the WS join reply with a actionable code, not just 404)
async function needsRulesAccept(me, lobby) {
  if (!lobby || lobby.kind !== 'channel' || !lobby.server_id) return false;
  const { data: srv } = await supabase.from('servers').select('id, rules, owner_id').eq('id', lobby.server_id).single();
  if (!srv || !srv.rules || srv.owner_id === me) return false;
  const { data: mem } = await supabase.from('server_members').select('rules_accepted_at').eq('server_id', srv.id).eq('user_id', me).single();
  return !mem || !mem.rules_accepted_at;
}

// Tell every open client its conversation list may be stale.
function sendConversationsDirty() {
  const data = JSON.stringify({ type: 'conversation_dirty' });
  for (const ws of allConnections) {
    if (ws.readyState === 1) { try { ws.send(data); } catch (e) {} }
  }
}

wss.on('connection', (ws) => {
  // Track all connections for lobby list broadcasts
  allConnections.add(ws);

  // Send current lobby list immediately
  ws.send(JSON.stringify({ type: 'lobby_list', lobbies: getLobbyList() }));

  ws.on('message', async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    // ── Join a lobby ──────────────────────────────────────────────
    if (msg.type === 'join') {
      const lobby = (msg.lobby || '').trim();
      if (!lobby || !validName(lobby)) {
        ws.send(JSON.stringify({ type: 'error', text: 'Invalid conversation.' }));
        return;
      }
      // Strict sign-in: verify the session, then derive identity server-side.
      // Client-supplied username/userId are ignored (no impersonation).
      var authed = null;
      try {
        const tok = String(msg.token || '').replace('Bearer ', '');
        if (tok) {
          const { data: { user: u }, error: uerr } = await supabase.auth.getUser(tok);
          if (!uerr && u) {
            const { data: prof } = await supabase.from('users').select('display_name, avatar_url').eq('id', u.id).single();
            authed = { id: u.id, name: (prof && prof.display_name) || String(u.email || 'Someone').split('@')[0], avatar: (prof && prof.avatar_url) || null };
          }
        }
      } catch (e) {}
      if (!authed) {
        ws.send(JSON.stringify({ type: 'error', text: 'Sign in required.' }));
        return;
      }
      const { data: lobbyRow } = await supabase.from('lobbies').select('id, name, kind, server_id, is_private').eq('name', lobby).single();
      if (!lobbyRow || !(await canSeeLobby(authed.id, lobbyRow))) {
        if (lobbyRow && await needsRulesAccept(authed.id, lobbyRow)) {
          ws.send(JSON.stringify({ type: 'error', code: 'rules_required', serverId: lobbyRow.server_id, text: 'Accept the server rules first.' }));
        } else {
          ws.send(JSON.stringify({ type: 'error', text: 'Conversation not found.' }));
        }
        return;
      }
      const username = authed.name;
      const userId = authed.id;

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
      const entry = { username, ws, userId, avatar: authed.avatar };
      room.add(entry);
      clients.set(ws, { username, lobby, userId, avatar: authed.avatar });

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
        lobby: info.lobby,
        username: info.username,
        user_id: info.userId,
        avatar_url: info.avatar || null,
        text,
        time,
        ts: new Date().toISOString(),
      });

      // Persist to database
      saveMessage(info.lobby, info.userId, info.username, text);
      // Everyone else's sidebar (previews, unread, order) may be stale
      sendConversationsDirty();
      return;
    }

    // ── Typing indicator ─────────────────────────────────────────
    if (msg.type === 'typing') {
      const info = clients.get(ws);
      if (!info) return;
      broadcast(info.lobby, { type: 'typing', lobby: info.lobby, username: info.username }, ws);
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
  console.log(`\n  Cudic is running → http://localhost:${PORT}\n`);
});
