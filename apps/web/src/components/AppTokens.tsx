import { useEffect, useState } from 'react';
import * as api from '../lib/api';
import type { ApiToken } from '../lib/types';

/**
 * App-token manager: create/list/revoke personal bearer tokens for native
 * (desktop / React Native) clients. The raw token is shown once on creation.
 */
export function AppTokens({ label, input }: { label: React.CSSProperties; input: React.CSSProperties }) {
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState<{ id: string; token: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try { setTokens(await api.listAppTokens()); } catch { /* ignore */ }
  }
  useEffect(() => { load(); }, []);

  async function create() {
    const n = name.trim();
    if (!n || busy) return;
    setBusy(true);
    setError(null);
    try {
      const created = await api.createAppToken(n);
      setFresh({ id: created.id, token: created.token });
      setName('');
      await load();
    } catch (e: any) {
      setError(e?.message?.replace(/^API Error \d+: /, '') || 'Could not create token.');
    } finally { setBusy(false); }
  }

  async function revoke(id: string) {
    if (!window.confirm('Revoke this token? Any client using it will be signed out.')) return;
    setTokens((prev) => prev.filter((t) => t.id !== id));
    if (fresh?.id === id) setFresh(null);
    try { await api.revokeAppToken(id); } catch { load(); }
  }

  function copyToken() {
    if (!fresh) return;
    navigator.clipboard?.writeText(fresh.token);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div>
      <span style={label}>App Tokens</span>
      <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--muted)' }}>
        Personal access tokens for signing into the desktop / mobile apps. Treat them like passwords.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <input style={{ ...input, flex: 1 }} value={name} maxLength={60} placeholder="Token name (e.g. My phone)"
          onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') create(); }} />
        <button onClick={create} disabled={!name.trim() || busy}
          style={{ padding: '10px 16px', borderRadius: 4, border: 'none', background: (name.trim() && !busy) ? 'var(--accent)' : 'var(--panel-dark)', color: (name.trim() && !busy) ? 'var(--accent-text)' : 'var(--muted-2)', cursor: (name.trim() && !busy) ? 'pointer' : 'default', fontWeight: 600, flexShrink: 0 }}>
          {busy ? 'Creating…' : 'Generate'}
        </button>
      </div>

      {error && <p style={{ color: 'var(--danger)', fontSize: 13, margin: '0 0 12px' }}>{error}</p>}

      {fresh && (
        <div style={{ background: 'var(--input-bg)', border: '1px solid var(--accent)', borderRadius: 8, padding: 12, marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Copy this token now — it won't be shown again.</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <code style={{ flex: 1, minWidth: 0, overflowX: 'auto', whiteSpace: 'nowrap', padding: '8px 10px', borderRadius: 4, background: 'var(--panel-dark)', color: 'var(--text-strong)', fontSize: 13, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{fresh.token}</code>
            <button onClick={copyToken}
              style={{ padding: '8px 14px', borderRadius: 4, border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', cursor: 'pointer', fontWeight: 600, flexShrink: 0 }}>
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      {tokens.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--muted-2)', fontStyle: 'italic' }}>No tokens yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {tokens.map((t) => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 6, background: 'var(--input-bg)' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 14, color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</div>
                <div style={{ fontSize: 12, color: 'var(--muted-2)' }}>
                  Created {new Date(t.createdAt).toLocaleDateString()} · {t.lastUsedAt ? `last used ${new Date(t.lastUsedAt).toLocaleDateString()}` : 'never used'}
                </div>
              </div>
              <button onClick={() => revoke(t.id)}
                style={{ padding: '6px 12px', borderRadius: 4, border: '1px solid var(--border)', background: 'transparent', color: 'var(--danger)', cursor: 'pointer', fontSize: 13, fontWeight: 600, flexShrink: 0 }}>
                Revoke
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
