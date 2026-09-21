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
  const redirectTo = window.location.origin + '/lobbies';

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

  // Auto-confirmed (session present): signed in immediately, no email needed
  if (data.session) return Object.assign({}, data, { verifyEmail: 'none' });

  // Send verification email via our server, fall back to Supabase's own mail
  if (data.user) {
    try {
      const serverBase = (typeof WS_URL !== 'undefined' && WS_URL) ? WS_URL.replace(/^wss?:\/\//, 'https://') : '';
      const res = await fetch(serverBase + '/auth/send-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email,
          userId: data.user.id,
          displayName: displayName,
        }),
      });
      if (!res.ok) throw new Error('custom mail unavailable');
      return Object.assign({}, data, { verifyEmail: 'custom' });
    } catch (err) {
      try {
        if (db) await db.auth.resend({ type: 'signup', email: email });
        return Object.assign({}, data, { verifyEmail: 'supabase' });
      } catch (e2) {
        return Object.assign({}, data, { verifyEmail: 'none' });
      }
    }
  }

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
  const db = await getSupabase();
  if (!db) return;
  await db.auth.signOut();
  window.location.href = '/';
}
