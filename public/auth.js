// ── Glox Auth Helper ──────────────────────────────────────────────
// Provides: signInWithGitHub(), signInWithEmail(), signUpWithEmail(),
//           getSession(), signOut(), handleAuthCallback()

function getSupabase() {
  if (window._supabasePromise) return window._supabasePromise;
  if (window._supabase) return Promise.resolve(window._supabase);
  if (typeof SUPABASE_URL === 'undefined' || SUPABASE_URL.includes('YOUR_')) return null;
  if (window.supabase && window.supabase.createClient) {
    window._supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return window._supabase;
  }
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
  document.head.appendChild(script);
  window._supabasePromise = new Promise((resolve, reject) => {
    script.onload = () => {
      try {
        window._supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        resolve(window._supabase);
      } catch(e) { reject(e); }
    };
    script.onerror = () => reject(new Error('Failed to load Supabase'));
  });
  return window._supabasePromise;
}

// ── Handle OAuth callback (runs on every page load) ──────────────
// Supabase redirects back with ?code=... (PKCE) or #access_token=... (implicit).
async function handleAuthCallback() {
  const url = new URL(window.location.href);

  // PKCE flow: ?code=...
  const code = url.searchParams.get('code');
  if (code) {
    const db = await getSupabase();
    if (!db) return;
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (error) { window._authError = error.message; throw error; }
    url.searchParams.delete('code');
    url.searchParams.delete('state');
    window.history.replaceState({}, '', url.pathname + url.search);
    return;
  }

  // Implicit flow: #access_token=...
  const hash = window.location.hash;
  if (hash && hash.includes('access_token')) {
    const db = await getSupabase();
    if (!db) return;
    // Supabase JS auto-parses the hash fragment and stores the session
    // Just need to clean the URL
    window.history.replaceState({}, '', url.pathname + url.search);
  }
}

// ── GitHub OAuth ─────────────────────────────────────────────────
async function signInWithGitHub() {
  const db = await getSupabase();
  if (!db) { alert('Supabase not configured'); return; }

  // Redirect back to the app hub after auth
  const redirectTo = window.location.origin + '/chat';

  const { error } = await db.auth.signInWithOAuth({
    provider: 'github',
    options: { redirectTo },
  });
  if (error) console.error('GitHub OAuth error:', error);
}

// ── Email sign in ────────────────────────────────────────────────
async function signInWithEmail(email, password) {
  const db = await getSupabase();
  if (!db) { alert('Supabase not configured'); return; }
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

// ── Email sign up ────────────────────────────────────────────────
async function signUpWithEmail(email, password, displayName) {
  const db = await getSupabase();
  if (!db) { alert('Supabase not configured'); return; }
  const { data, error } = await db.auth.signUp({
    email,
    password,
    options: { data: { full_name: displayName } },
  });
  if (error) throw error;

  // Session present: signed in immediately (soft mode — publishing and
  // chat stay locked until the email code is confirmed; login.html owns
  // that UI via /auth/send-code + /auth/verify-code).
  return data;
}

// ── Get session ──────────────────────────────────────────────────
async function getSession() {
  const db = await getSupabase();
  if (!db) return null;
  const { data: { session } } = await db.auth.getSession();
  return session;
}

// ── Sign out ─────────────────────────────────────────────────────
async function signOut() {
  try { await releaseSeat(); } catch (e) {}
  try { localStorage.removeItem('cudic_seat'); } catch (e) {}
  const db = await getSupabase();
  if (!db) return;
  await db.auth.signOut();
  window.location.href = '/';
}

// ── Single-seat sessions ─────────────────────────────────────────
// One live seat per account. Seat id minted at login (fresh id = takeover),
// heartbeat while this tab is the elected leader. Any 403
// session_superseded -> paused banner with Take over (which mints fresh,
// claims, and reloads). Tabs in one browser elect a leader via
// localStorage lock; the server can't tell tabs apart.
var SEAT_KEY = 'cudic_seat';
var TAB_LOCK_KEY = 'cudic_tab_lock';
var TAB_ID = 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
var TAB_BEAT_MS = 5000, TAB_STALE_MS = 10000, HB_BEAT_MS = 30000;
var tabLeader = false, hbTimer = null, tabTimer = null;
var seatPaused = null; // null | 'tab' | 'device' (device wins)
function seatId() { try { return localStorage.getItem(SEAT_KEY) || ''; } catch (e) { return ''; } }
function mintSeat() {
  var s = 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  try { localStorage.setItem(SEAT_KEY, s); } catch (e) {}
  return s;
}
function seatApi() { return (typeof WS_URL !== 'undefined' && WS_URL) ? WS_URL.replace(/^wss?:\/\//, 'https://') : ''; }
async function seatToken() {
  try {
    if (window.currentToken) return window.currentToken;
    if (typeof getAuthToken === 'function') return await getAuthToken();
  } catch (e) {}
  return null;
}
async function claimSeat() {
  try {
    var t = await seatToken();
    if (!t) return false;
    var seat = seatId() || mintSeat();
    var r = await fetch(seatApi() + '/api/session/claim', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + t, 'Content-Type': 'application/json' },
      body: JSON.stringify({ seat: seat })
    });
    return r.ok;
  } catch (e) { return false; }
}
async function heartbeatSeat() {
  try {
    var t = await seatToken();
    var s = seatId();
    if (!t || !s) return false;
    var r = await fetch(seatApi() + '/api/session/heartbeat', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + t, 'Content-Type': 'application/json' },
      body: JSON.stringify({ seat: s })
    });
    if (r.status === 403) {
      try {
        var d = await r.json();
        if (d && d.error === 'session_superseded') { pauseSeat('device'); return false; }
      } catch (e) {}
    }
    return r.ok;
  } catch (e) { return false; }
}
async function releaseSeat() {
  try {
    var t = await seatToken();
    var s = seatId();
    if (!t || !s) return;
    await fetch(seatApi() + '/api/session', {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + t, 'Content-Type': 'application/json' },
      body: JSON.stringify({ seat: s })
    });
  } catch (e) {}
}
function seatHeaders(h) {
  h = h || {};
  var s = seatId();
  if (s) h['X-Seat'] = s;
  return h;
}
// Boot: claim ONLY when minting fresh (no seat yet) or on a fresh login.
// Normal loads heartbeat instead — refreshes our row when it is ours (or
// expired away) and learns about a real takeover via 403, but never kicks
// another device just by loading a page. (Claim is an unconditional
// takeover server-side, so calling it per-load turned every stray load
// anywhere — second browser, forgotten tab farm, automated checks — into
// a kick for the main tab.)
async function bootSeat(freshLogin) {
  try {
    // Fresh logins (OAuth return especially) must CLAIM — the seat was
    // just minted and the server never saw it, so a heartbeat 403s as a
    // phantom "another device" whenever any other live seat exists.
    if (freshLogin) { mintSeat(); await claimSeat(); }
    else if (!seatId()) { mintSeat(); await claimSeat(); }
    else { await heartbeatSeat(); }
  } catch (e) {}
  startSeatSystem();
}
// ── Paused banner (shared; auth.js loads on every banner page) ──
function ensureSeatBanner() {
  var b = document.getElementById('seatBanner');
  if (b) return b;
  b = document.createElement('div');
  b.id = 'seatBanner';
  b.style.display = 'none';
  var t = document.createElement('span');
  t.id = 'seatBannerText';
  var btn = document.createElement('button');
  btn.id = 'seatTakeover';
  btn.className = 'btn btn-primary';
  btn.textContent = 'Take over';
  btn.addEventListener('click', function () {
    mintSeat();
    claimSeat().then(function () { window.location.reload(); });
  });
  b.appendChild(t);
  b.appendChild(btn);
  document.body.appendChild(b);
  return b;
}
function pauseSeat(reason) {
  if (seatPaused === 'device') return; // device kick wins over tab news
  if (reason === 'tab' && seatPaused === 'tab') return;
  seatPaused = reason;
  stopHeartbeat();
  var b = ensureSeatBanner();
  document.getElementById('seatBannerText').textContent = reason === 'device'
    ? 'Paused — this account signed in on another device.'
    : 'Paused — this account is open in another tab.';
  b.style.display = 'flex';
  try {
    var inp = document.getElementById('msgInput');
    if (inp) inp.disabled = true;
  } catch (e) {}
}
function resumeSeat() {
  seatPaused = null;
  var b = document.getElementById('seatBanner');
  if (b) b.style.display = 'none';
  try {
    var inp = document.getElementById('msgInput');
    if (inp) inp.disabled = false;
  } catch (e) {}
}
// ── Tab leader election: only the leader heartbeats ──
function tabTick() {
  var now = Date.now(), raw = null;
  try { raw = JSON.parse(localStorage.getItem(TAB_LOCK_KEY) || 'null'); } catch (e) {}
  if (!raw || !raw.tab || (now - raw.at) > TAB_STALE_MS || raw.tab === TAB_ID) {
    try { localStorage.setItem(TAB_LOCK_KEY, JSON.stringify({ tab: TAB_ID, at: now })); } catch (e) {}
    if (!tabLeader) {
      tabLeader = true;
      if (seatPaused === 'tab') resumeSeat();
      heartbeatSeat();
      startHeartbeat();
    }
  } else {
    // Another tab leads: stand down silently. Same-browser tabs share one
    // seat, so this tab keeps working — no banner, no scare. (The banner
    // now fires only for a real device takeover.)
    tabLeader = false;
    stopHeartbeat();
    if (seatPaused === 'tab') resumeSeat();
  }
}
function startHeartbeat() {
  stopHeartbeat();
  hbTimer = setInterval(function () {
    if (tabLeader && !seatPaused) heartbeatSeat();
  }, HB_BEAT_MS);
}
function stopHeartbeat() {
  if (hbTimer) { clearInterval(hbTimer); hbTimer = null; }
}
function startSeatSystem() {
  if (tabTimer) return;
  tabTick();
  tabTimer = setInterval(tabTick, TAB_BEAT_MS);
  try {
    window.addEventListener('focus', function () { tabTick(); });
  } catch (e) {}
}

// ── Strip ?token= from the address bar once a page has read it ──
// Live JWTs in URLs leak into history, logs and anything the user shares.
// Each page reads ?token= first, then calls this to clean the URL.
function scrubTokenUrl() {
  try {
    if (location.search.indexOf('token=') === -1) return;
    var s = location.search
      .replace(/([?&])token=[^&#]+&?/g, '$1')
      .replace(/[?&]&/g, '$1')
      .replace(/[?&]$/, '');
    history.replaceState({}, '', location.pathname + s);
  } catch (e) {}
}
