import { useEffect, useState } from 'react';
import { setServerUrl, setToken, serverOrigin, getToken } from '../lib/serverConfig';
import * as api from '../lib/api';

/**
 * First-run screen for the native (desktop) shell. Preferred path: enter the server
 * address and "Sign in" — this opens the normal browser SSO, and the server hands a
 * token back to the app via the openchat:// deep link (no manual token paste).
 * A manual token field is kept as a fallback.
 */
export function DesktopSetup({ onDone }: { onDone: () => void }) {
  const [url, setUrl] = useState(serverOrigin() || 'https://');
  const [waiting, setWaiting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [manualToken, setManualToken] = useState(getToken() || '');
  const [busy, setBusy] = useState(false);

  // The deep-link handler in the shell emits "auth-token" once SSO completes.
  useEffect(() => {
    const t = (window as any).__TAURI__;
    if (!t?.event?.listen) return;
    let unlisten: (() => void) | undefined;
    t.event.listen('auth-token', (e: any) => {
      const token = e?.payload ? String(e.payload) : '';
      if (token) { setToken(token); window.location.reload(); }
    }).then((u: () => void) => { unlisten = u; }).catch(() => {});
    return () => { if (unlisten) unlisten(); };
  }, []);

  function normalizedUrl(): string | null {
    const u = url.trim().replace(/\/$/, '');
    if (!/^https?:\/\/.+/.test(u)) { setErr('Enter your server address (https://…).'); return null; }
    return u;
  }

  async function signIn() {
    const u = normalizedUrl();
    if (!u) return;
    setErr(null);
    setServerUrl(u);
    const target = `${u}/api/auth/desktop`;
    const t = (window as any).__TAURI__;
    try {
      await t.core.invoke('open_external', { url: target });
      setWaiting(true);
    } catch {
      setErr('Could not open the browser. Try the manual token option below.');
    }
  }

  async function connectManual() {
    const u = normalizedUrl();
    if (!u) return;
    const tok = manualToken.trim();
    if (!tok) { setErr('Paste an app token, or use Sign in above.'); return; }
    setBusy(true); setErr(null);
    setServerUrl(u); setToken(tok);
    try {
      await api.getMe();
      onDone();
    } catch {
      setServerUrl(''); setToken(null);
      setErr('Could not connect — check the server address and token.');
      setBusy(false);
    }
  }

  const input: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 6,
    border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', outline: 'none', fontSize: 14,
  };
  const label: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--muted)', margin: '0 0 6px' };

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'var(--bg)' }}>
      <div style={{ width: '100%', maxWidth: 380, background: 'var(--panel)', borderRadius: 12, padding: 28, boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 20, color: 'var(--text-strong)' }}>Welcome to OpenChat</h2>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--muted)' }}>Connect to your server and sign in.</p>

        <label style={label}>Server address</label>
        <input style={{ ...input, marginBottom: 16 }} value={url} placeholder="https://chat.example.com"
          onChange={(e) => setUrl(e.target.value)} autoFocus onKeyDown={(e) => { if (e.key === 'Enter') signIn(); }} />

        {err && <p style={{ color: 'var(--danger)', fontSize: 13, margin: '0 0 14px' }}>{err}</p>}

        {waiting ? (
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 14, color: 'var(--text)', margin: '0 0 10px' }}>Finish signing in in your browser…</p>
            <button onClick={() => setWaiting(false)}
              style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
          </div>
        ) : (
          <button onClick={signIn}
            style={{ width: '100%', padding: '11px 0', borderRadius: 7, border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', cursor: 'pointer', fontWeight: 700, fontSize: 15 }}>
            Sign in
          </button>
        )}

        <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
          {!showManual ? (
            <button onClick={() => setShowManual(true)}
              style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 12 }}>
              Advanced: use an app token
            </button>
          ) : (
            <>
              <label style={label}>App token</label>
              <input style={{ ...input, marginBottom: 10 }} value={manualToken} placeholder="oc_…" type="password"
                onChange={(e) => setManualToken(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') connectManual(); }} />
              <button onClick={connectManual} disabled={busy}
                style={{ width: '100%', padding: '9px 0', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', cursor: busy ? 'default' : 'pointer', fontWeight: 600, fontSize: 13 }}>
                {busy ? 'Connecting…' : 'Connect with token'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
