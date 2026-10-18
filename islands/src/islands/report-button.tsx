import { useEffect, useState } from 'react';
import { Flag, Loader2 } from 'lucide-react';
import { apiPost, getToken } from '../cudic';

// Game report island (plan.md 2.1): a Report button + modal on game pages.
// Button sweep + send-state behavior adapted from the cudic-test button
// library (ShineButton / LoadingButton), restyled here in .isl- CSS with
// site vars — islands ship no Tailwind. Reason values match the server's
// REPORT_REASONS so pack and game reports share one review queue.
// shortcut: no evidence upload in v1 — reason + details only. The pack
// report flow on /themes keeps picture upload; add it here if game-report
// volume ever needs screenshots.
const GAME_REASONS = [
  { value: 'broken', label: 'Broken or unplayable' },
  { value: 'stolen', label: 'Stolen or copied work' },
  { value: 'spam', label: 'Spam or misleading listing' },
  { value: 'inappropriate', label: 'Inappropriate content' },
  { value: 'other', label: 'Something else' },
];

// A person, not a listing: "broken or unplayable" and "stolen work" are
// nonsense things to say about an account. Values stay in the server's
// REPORT_REASONS so both kinds land in the same review queue.
const USER_REASONS = [
  { value: 'inappropriate', label: 'Harassment or abuse' },
  { value: 'spam', label: 'Spam or advertising' },
  { value: 'other', label: 'Something else' },
];

// What is being reported: this game by default, or a player's account when the
// game page's multiplayer strip calls window.CudicReport.open().
type ReportTarget = { content_type: 'game' | 'user'; content_id: string; label?: string };

declare global {
  interface Window {
    CudicReport?: { open: (t: ReportTarget) => void };
  }
}

function pageGameId(): string | null {
  try {
    return new URLSearchParams(window.location.search).get('id') || null;
  } catch {
    return null;
  }
}

// Liquid fill origin (ports the button library's LiquidFillButton): the
// red pool expands from the cursor, not the center.
function setFillOrigin(e: React.PointerEvent<HTMLButtonElement>) {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty('--x', `${e.clientX - r.left}px`);
  e.currentTarget.style.setProperty('--y', `${e.clientY - r.top}px`);
}

export default function ReportButton() {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<ReportTarget | null>(null);
  const [reason, setReason] = useState('broken');
  const [details, setDetails] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');
  const [needSignin, setNeedSignin] = useState(false);
  const id = pageGameId();
  const forUser = target?.content_type === 'user';
  const reasons = forUser ? USER_REASONS : GAME_REASONS;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open ]);
  // The game page's "playing now" strip reports a player by account, so it
  // needs this same modal pointed somewhere else.
  useEffect(() => {
    window.CudicReport = { open: (t) => void openModal(t) };
    return () => {
      delete window.CudicReport;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!id) return null;

  async function openModal(t?: ReportTarget) {
    const next: ReportTarget = t ?? { content_type: 'game', content_id: id as string };
    setTarget(next);
    setReason((next.content_type === 'user' ? USER_REASONS : GAME_REASONS)[0].value);
    const tok = await getToken();
    setNeedSignin(!tok);
    setState('idle');
    setError('');
    setOpen(true);
  }
  async function send() {
    if (state === 'sending') return;
    setState('sending');
    setError('');
    try {
      await apiPost('/api/reports', {
        content_type: target?.content_type ?? 'game',
        content_id: target?.content_id ?? id,
        reason,
        details: details.trim().substring(0, 1000),
      });
      setState('sent');
      window.setTimeout(() => {
        setOpen(false);
        setState('idle');
        setDetails('');
      }, 1600);
    } catch (e) {
      setState('error');
      setError(e instanceof Error ? e.message : 'Report failed.');
    }
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-secondary isl-shinebtn isl-fillbtn"
        onClick={() => void openModal()}
        onPointerEnter={setFillOrigin}
        onPointerLeave={setFillOrigin}
      >
        <span className="isl-filltx">
          <Flag size={14} strokeWidth={1.8} aria-hidden="true" />
          Report
        </span>
      </button>
      {open && (
        <div
          className="isl-roverlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="isl-rmodal" role="dialog" aria-modal="true" aria-label={forUser ? `Report ${target?.label ?? 'player'}` : 'Report this game'}>
            <h3>{forUser ? `Report ${target?.label ?? 'player'}` : 'Report this game'}</h3>
            {needSignin ? (
              <>
                <p className="isl-rsub">{forUser ? 'Sign in to flag this player for review.' : 'Sign in to flag this game for review.'}</p>
                <div className="isl-ractions">
                  <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>
                    Cancel
                  </button>
                  <a className="btn btn-primary" href="/login" style={{ textDecoration: 'none' }}>
                    Sign in
                  </a>
                </div>
              </>
            ) : (
              <>
                <p className="isl-rsub">
                  {forUser
                    ? 'Room chat is never stored, so write what happened — your note is all the reviewer sees.'
                    : 'Flagged games go to a human for review.'}
                </p>
                <label className="isl-rfield">
                  <span>Reason</span>
                  <select value={reason} onChange={(e) => setReason(e.target.value)}>
                    {reasons.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="isl-rfield">
                  <span>Details {forUser ? '' : '(optional)'}</span>
                  <textarea
                    rows={3}
                    maxLength={1000}
                    placeholder={forUser ? 'What did they say or do?' : 'What did you see?'}
                    value={details}
                    onChange={(e) => setDetails(e.target.value)}
                  />
                </label>
                {state === 'error' && <div className="isl-rmsg err">{error}</div>}
                {state === 'sent' && <div className="isl-rmsg ok">Report sent — a human will review it.</div>}
                <div className="isl-ractions">
                  <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary isl-rsend"
                    onClick={send}
                    disabled={state === 'sending' || state === 'sent' || (forUser && !details.trim())}
                  >
                    {state === 'sending' && <Loader2 size={14} className="isl-spin" aria-hidden="true" />}
                    {state === 'sending' ? 'Sending…' : state === 'sent' ? 'Sent' : 'Send report'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
