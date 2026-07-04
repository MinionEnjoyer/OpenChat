import { useEffect, useRef, useState } from 'react';
import type { Notifications, Server } from '../lib/types';
import * as api from '../lib/api';
import { acceptFriendRequest, declineFriendRequest } from '../lib/social';
import { Avatar } from './Avatar';

const EMPTY: Notifications = { friendRequests: [], serverInvites: [], count: 0 };

export function NotificationHub({ onServerJoined, reloadKey, onChanged, onToast }: {
  onServerJoined: (server: Server) => void;
  reloadKey?: number;
  onChanged?: () => void;
  onToast?: (msg: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Notifications>(EMPTY);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  async function load() {
    try {
      setData(await api.getNotifications());
    } catch { /* ignore transient errors */ }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, []);

  // Reload immediately when a live 'notify' push arrives (friend request / server invite).
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [reloadKey]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  function dropFriendReq(id: string) {
    setData((d) => ({ ...d, friendRequests: d.friendRequests.filter((x) => x.id !== id), count: Math.max(0, d.count - 1) }));
  }
  function dropInvite(id: string) {
    setData((d) => ({ ...d, serverInvites: d.serverInvites.filter((x) => x.id !== id), count: Math.max(0, d.count - 1) }));
  }
  // Run an action optimistically: the UI already updated; call the API, then refresh, and
  // roll back (reload) on failure.
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try { await fn(); onChanged?.(); } catch (e) { console.error(e); await load(); } finally { setBusy(false); }
  }

  const btn: React.CSSProperties = {
    padding: '4px 10px', borderRadius: 4, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 12,
  };
  const accept: React.CSSProperties = { ...btn, background: 'var(--success)', color: '#fff' };
  const decline: React.CSSProperties = { ...btn, background: 'var(--danger)', color: '#fff' };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Notifications"
        style={{ background: 'none', border: 'none', color: 'var(--text)', fontSize: 18, cursor: 'pointer', position: 'relative', lineHeight: 1 }}
      >
        🔔
        {data.count > 0 && (
          <span style={{
            position: 'absolute', top: -6, right: -8, background: 'var(--danger)', color: '#fff',
            borderRadius: 10, fontSize: 10, fontWeight: 700, padding: '1px 5px', minWidth: 16, textAlign: 'center',
          }}>
            {data.count}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 320, maxHeight: 420, overflowY: 'auto',
          background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)', zIndex: 60, padding: 12,
        }}>
          <div style={{ fontWeight: 700, color: 'var(--text-strong)', marginBottom: 10 }}>Notifications</div>

          {data.count === 0 && <p style={{ color: 'var(--muted)', fontSize: 14, margin: '8px 0' }}>You're all caught up. 🎉</p>}

          {data.serverInvites.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--muted)', marginBottom: 6 }}>Server Invites</div>
              {data.serverInvites.map((inv) => (
                <div key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
                  <Avatar user={{ username: inv.server.name, displayName: inv.server.name, avatarUrl: inv.server.iconUrl }} size={32} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: 'var(--text-strong)', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inv.server.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>from {inv.inviter.displayName || inv.inviter.username}</div>
                  </div>
                  <button style={accept} disabled={busy} onClick={() => { dropInvite(inv.id); onToast?.(`✓ Joined ${inv.server.name}`); run(async () => { const s = await api.acceptServerInvite(inv.id); onServerJoined(s); }); }}>Join</button>
                  <button style={decline} disabled={busy} onClick={() => { dropInvite(inv.id); run(() => api.declineServerInvite(inv.id).then(() => {})); }}>✕</button>
                </div>
              ))}
            </div>
          )}

          {data.friendRequests.length > 0 && (
            <div>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--muted)', marginBottom: 6 }}>Friend Requests</div>
              {data.friendRequests.map((fr) => (
                <div key={fr.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
                  <Avatar user={fr.user} size={32} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: 'var(--text-strong)', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fr.user.displayName || fr.user.username}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>@{fr.user.username}</div>
                  </div>
                  <button style={accept} disabled={busy} onClick={() => { dropFriendReq(fr.id); onToast?.(`✓ You are now friends with ${fr.user.displayName || fr.user.username}`); run(() => acceptFriendRequest(fr.id)); }}>Accept</button>
                  <button style={decline} disabled={busy} onClick={() => { dropFriendReq(fr.id); run(() => declineFriendRequest(fr.id)); }}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
