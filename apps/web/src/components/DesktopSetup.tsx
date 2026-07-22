import { useState } from 'react';
import { setServerUrl, setToken, serverOrigin, getToken } from '../lib/serverConfig';
import * as api from '../lib/api';

/**
 * First-run screen for the native (desktop) shell: point the app at a server and
 * sign in with an app token (Settings → 🔑 Tokens on the web app). Shown only when
 * running in the native shell and not yet configured.
 */
export function DesktopSetup({ onDone }: { onDone: () => void }) {
  const [url, setUrl] = useState(serverOrigin() || 'https://');
  const [token, setTok] = useState(getToken() || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function connect() {
    const u = url.trim().replace(/\/$/, '');
    const t = token.trim();
    if (!u || !t) { setErr('Enter both a server URL and an app token.'); return; }
    setBusy(true); setErr(null);
    setServerUrl(u); setToken(t);
    try {
      await api.getMe();
      onDone();
    } catch {
      setServerUrl(''); setToken(null);
      setErr('Could not connect — double-check the server URL and token.');
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
        <h2 style={{ margin: '0 0 4px', fontSize: 20, color: 'var(--text-strong)' }}>Connect to OpenChat</h2>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--muted)' }}>
          Point the app at your server and sign in with an app token (create one in the web app under Settings → 🔑 Tokens).
        </p>

        <label style={label}>Server URL</label>
        <input style={{ ...input, marginBottom: 14 }} value={url} placeholder="https://chat.example.com"
          onChange={(e) => setUrl(e.target.value)} autoFocus />

        <label style={label}>App Token</label>
        <input style={{ ...input, marginBottom: 18 }} value={token} placeholder="oc_…" type="password"
          onChange={(e) => setTok(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') connect(); }} />

        {err && <p style={{ color: 'var(--danger)', fontSize: 13, margin: '0 0 14px' }}>{err}</p>}

        <button onClick={connect} disabled={busy}
          style={{ width: '100%', padding: '11px 0', borderRadius: 7, border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', cursor: busy ? 'default' : 'pointer', fontWeight: 700, fontSize: 15 }}>
          {busy ? 'Connecting…' : 'Connect'}
        </button>
      </div>
    </div>
  );
}
