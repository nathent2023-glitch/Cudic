// ── Shared island helpers: read-only bridge to the classic page ──
// Islands never duplicate auth/config: everything comes from the host
// page's globals (config.js / auth.js / sidebar.js). All class names
// below are informational only — styling is scoped .isl- CSS.

declare const WS_URL: string | undefined;

export function apiBase(): string {
  try {
    if (typeof WS_URL !== 'undefined' && WS_URL) return WS_URL.replace(/^wss?:\/\//, 'https://');
  } catch {}
  return '';
}

export async function getToken(): Promise<string | null> {
  try {
    const w = window as any;
    if (typeof w.getAuthToken === 'function') {
      const t = await w.getAuthToken();
      if (t) return t;
    }
  } catch {}
  try {
    const r = localStorage.getItem('sb-opimjwmgmzwapkzgxvhk-auth-token');
    return r ? JSON.parse(r).access_token : null;
  } catch {
    return null;
  }
}

// Seat header for writes (likes, saves, comments). Reads skip it.
export function seatHeaders(): Record<string, string> {
  try {
    const w = window as any;
    if (typeof w.seatHeaders === 'function') return w.seatHeaders();
    const s = localStorage.getItem('cudic_seat');
    if (s) return { 'X-Seat': s };
  } catch {}
  return {};
}

export async function apiGet<T>(path: string, auth?: boolean): Promise<T> {
  const headers: Record<string, string> = {};
  if (auth) {
    const t = await getToken();
    if (t) headers['Authorization'] = 'Bearer ' + t;
  }
  const r = await fetch(apiBase() + path, { headers });
  if (!r.ok) throw new Error('Request failed: ' + r.status);
  return r.json();
}
