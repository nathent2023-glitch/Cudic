// ── Glox config ────────────────────────────────────────────────────
// Local dev (localhost) talks to the local backend (same host) so new
// endpoints work before they deploy. Production uses the Render backend.
const WS_URL = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? ''
  : 'wss://glox-o7rr.onrender.com';

// Supabase credentials (for client-side auth)
const SUPABASE_URL = 'https://opimjwmgmzwapkzgxvhk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9waW1qd21nbXp3YXBremd4dmhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0ODk2NjYsImV4cCI6MjEwNTA2NTY2Nn0.fU0WlDVrxnRR5veEk4kI6K4HklQoVtxkzPWMH5SSo7A';
