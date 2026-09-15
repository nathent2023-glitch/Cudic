// ── Glox Auth Helper ──────────────────────────────────────────────
// Provides: initSupabase(), signInWithGitHub(), signInWithGoogle(),
//           getSession(), signOut()

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

async function signInWithGitHub() {
  const db = await getSupabase();
  if (!db) { alert('Supabase not configured'); return; }
  const wsHost = (typeof WS_URL !== 'undefined' && WS_URL) ? WS_URL.replace(/^wss?:\/\//, '').replace(/^ws/, 'http') : location.origin;
  await db.auth.signInWithOAuth({
    provider: 'github',
    options: { redirectTo: wsHost + '/auth/callback' },
  });
}

async function signInWithGoogle() {
  const db = await getSupabase();
  if (!db) { alert('Supabase not configured'); return; }
  const wsHost = (typeof WS_URL !== 'undefined' && WS_URL) ? WS_URL.replace(/^wss?:\/\//, '').replace(/^ws/, 'http') : location.origin;
  await db.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: wsHost + '/auth/callback' },
  });
}

async function signInWithEmail(email, password) {
  const db = await getSupabase();
  if (!db) { alert('Supabase not configured'); return; }
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

async function signUpWithEmail(email, password, displayName) {
  const db = await getSupabase();
  if (!db) { alert('Supabase not configured'); return; }
  const { error } = await db.auth.signUp({
    email,
    password,
    options: { data: { full_name: displayName } },
  });
  if (error) throw error;
}

async function getSession() {
  const db = await getSupabase();
  if (!db) return null;
  const { data: { session } } = await db.auth.getSession();
  return session;
}

async function signOut() {
  const db = await getSupabase();
  if (!db) return;
  await db.auth.signOut();
  window.location.href = '/';
}
