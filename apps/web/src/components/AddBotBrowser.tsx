import { useEffect, useState } from 'react';
import * as api from '../lib/api';
import type { Bot } from '../lib/types';
import { Avatar } from './Avatar';
import { BotBadge } from './BotBadge';

/**
 * Add-bot browser: lists published bots and adds/removes them on this server. Rendered in
 * Server Settings for users with Manage Server.
 */
export function AddBotBrowser({ serverId, label }: { serverId: string; label: React.CSSProperties }) {
  const [dir, setDir] = useState<Bot[]>([]);
  const [inServer, setInServer] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    const [bots, members] = await Promise.all([
      api.listBotDirectory().catch(() => [] as Bot[]),
      api.listMembers(serverId).catch(() => []),
    ]);
    setDir(bots);
    setInServer(new Set(members.filter((m) => m.user.isBot).map((m) => m.userId)));
    setLoaded(true);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [serverId]);

  async function add(b: Bot) {
    setBusy(b.id);
    try { await api.addBotToServer(serverId, b.id); setInServer((s) => new Set(s).add(b.id)); }
    catch { /* ignore */ } finally { setBusy(null); }
  }
  async function remove(b: Bot) {
    setBusy(b.id);
    try { await api.removeBotFromServer(serverId, b.id); setInServer((s) => { const n = new Set(s); n.delete(b.id); return n; }); }
    catch { /* ignore */ } finally { setBusy(null); }
  }

  const btn: React.CSSProperties = { padding: '7px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13 };

  return (
    <div>
      <span style={label}>Add a Bot</span>
      <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--muted)' }}>
        Published bots can be added to this server. Build your own in Settings → 🤖 Bots.
      </p>
      {loaded && dir.length === 0 && <p style={{ fontSize: 13, color: 'var(--muted)' }}>No published bots yet.</p>}
      {dir.map((b) => {
        const added = inServer.has(b.id);
        return (
          <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
            <Avatar user={{ username: b.username, displayName: b.displayName, avatarUrl: b.avatarUrl }} size={36} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{b.displayName || b.username}<BotBadge /></div>
              {b.botDescription && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{b.botDescription}</div>}
            </div>
            {added ? (
              <button onClick={() => remove(b)} disabled={busy === b.id}
                style={{ ...btn, background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)' }}>
                {busy === b.id ? '…' : 'Remove'}
              </button>
            ) : (
              <button onClick={() => add(b)} disabled={busy === b.id}
                style={{ ...btn, background: 'var(--accent)', color: 'var(--accent-text)' }}>
                {busy === b.id ? '…' : 'Add'}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
