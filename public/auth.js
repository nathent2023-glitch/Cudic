// ── Glox Auth Helper ──────────────────────────────────────────────
// Provides: signInWithGitHub(), signInWithEmail(), signUpWithEmail(),
//           getSession(), signOut(), handleAuthCallback()

function getSupabase() {
  if (window._supabase) return window._supabase;
  if (typeof SUPABASE_URL === 'undefined' || SUPABASE_URL.includes('YOUR_')) return null;

  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
  document.head.appendChild(script);

  return new Promise((resolve) => {
    script.onload = () => {
      window._supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      resolve(window._supabase);
    };
  });
}

// ── Handle OAuth callback (runs on every page load) ──────────────
// Supabase redirects back with ?code=... in the URL.
// We exchange it for a session client-side.
async function handleAuthCallback() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  if (!code) return;

  const db = await getSupabase();
  if (!db) return;

  // Exchange the code for a session
  const { error } = await db.auth.exchangeCodeForSession(code);
  if (error) {
    console.error('Auth callback error:', error.message);
  }

  // Clean the URL — remove ?code=... so it doesn't re-trigger
  url.searchParams.delete('code');
  url.searchParams.delete('state');
  window.history.replaceState({}, '', url.pathname + url.search);
}

// ── GitHub OAuth ─────────────────────────────────────────────────
async function signInWithGitHub() {
  const db = await getSupabase();
  if (!db) { alert('Supabase not configured'); return; }

  // Redirect back to the Vercel frontend after auth
  const redirectTo = window.location.origin + '/';

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

  // Send verification email via our server
  if (data.user) {
    try {
      const serverBase = (typeof WS_URL !== 'undefined' && WS_URL) ? WS_URL.replace(/^wss?:\/\//, 'https://') : '';
      await fetch(serverBase + '/auth/send-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email,
          userId: data.user.id,
          displayName: displayName,
        }),
      });
    } catch (err) {
      console.error('Failed to send verification email:', err);
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
