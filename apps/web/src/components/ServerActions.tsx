import React from 'react';
import { createInvite, acceptInvite, getInvite } from '../lib/social';
import { createServer } from '../lib/api';
import { HeaderPanel } from './HeaderPanel';

export function ServerActions({
  activeServerId,
  onChanged,
}: {
  activeServerId: string | null;
  onChanged: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [inviteCode, setInviteCode] = React.useState<string | null>(null);
  const [action, setAction] = React.useState<'create' | 'join' | null>(null);
  const [serverName, setServerName] = React.useState('');
  const [joinCode, setJoinCode] = React.useState('');
  const [joinPreview, setJoinPreview] = React.useState<{ server: { name: string } } | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [actionError, setActionError] = React.useState('');
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const openAction = (next: 'create' | 'join') => {
    setOpen(false);
    setAction(next);
    setActionError('');
    setJoinPreview(null);
  };

  const handleCreateServer = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = serverName.trim();
    if (!name || submitting) return;
    setSubmitting(true);
    setActionError('');
    try {
      await createServer(name);
      setAction(null);
      setServerName('');
      onChanged();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to create server.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleJoinServer = async (event: React.FormEvent) => {
    event.preventDefault();
    const code = joinCode.trim();
    if (!code || submitting) return;
    setSubmitting(true);
    setActionError('');
    try {
      if (!joinPreview) {
        setJoinPreview(await getInvite(code));
      } else {
        await acceptInvite(code);
        setAction(null);
        setJoinCode('');
        setJoinPreview(null);
        onChanged();
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Invalid or expired invite code.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateInvite = async () => {
    setOpen(false);
    if (!activeServerId) return;
    try {
      const invite = await createInvite(activeServerId);
      setInviteCode(invite.code);
    } catch {
      alert('Failed to create invite.');
    }
  };

  const menuItem: React.CSSProperties = {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    padding: '10px 14px',
    background: 'none',
    border: 'none',
    color: 'var(--text)',
    cursor: 'pointer',
    fontSize: 14,
  };

  return (
    <div style={{ position: 'relative', padding: 10, borderTop: '1px solid var(--border)' }} ref={menuRef}>
      {inviteCode ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            readOnly
            value={inviteCode}
            onClick={(e) => e.currentTarget.select()}
            style={{
              flex: 1,
              padding: '8px',
              background: 'var(--input-bg)',
              border: '1px solid var(--border)',
              borderRadius: 4,
              color: 'var(--text)',
              fontSize: 13,
              outline: 'none',
            }}
          />
          <button
            onClick={() => setInviteCode(null)}
            style={{ padding: '8px 10px', background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', borderRadius: 4, cursor: 'pointer' }}
          >
            Done
          </button>
        </div>
      ) : (
        <button
          onClick={() => setOpen((v) => !v)}
          style={{
            width: '100%',
            padding: '10px',
            background: 'var(--accent)',
            color: 'var(--accent-text)',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          <span style={{ fontSize: 18, lineHeight: 1 }}>＋</span> Add a Server
        </button>
      )}

      {open && (
        <div
          style={{
            position: 'absolute',
            bottom: 'calc(100% - 4px)',
            left: 10,
            right: 10,
            background: 'var(--panel-dark)',
            borderRadius: 6,
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
            overflow: 'hidden',
            zIndex: 30,
          }}
        >
          <button style={menuItem} onClick={() => openAction('create')}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}>
            ✨ Create a Server
          </button>
          <button style={menuItem} onClick={() => openAction('join')}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}>
            🔗 Join a Server
          </button>
          {activeServerId && (
            <button style={menuItem} onClick={handleCreateInvite}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}>
              ✉️ Invite People
            </button>
          )}
        </div>
      )}

      {action === 'create' && (
        <HeaderPanel title="Create a server" onClose={() => setAction(null)}>
          <form onSubmit={handleCreateServer} style={{ padding: 16, display: 'grid', gap: 12 }}>
            <label style={{ display: 'grid', gap: 6, color: 'var(--muted)', fontSize: 13 }}>
              Server name
              <input autoFocus value={serverName} onChange={(event) => setServerName(event.target.value)} maxLength={80}
                style={{ padding: '10px 11px', border: '1px solid var(--border)', borderRadius: 7, background: 'var(--input-bg)', color: 'var(--text)', font: 'inherit' }} />
            </label>
            {actionError && <div role="alert" style={{ color: 'var(--danger)', fontSize: 13 }}>{actionError}</div>}
            <button type="submit" disabled={!serverName.trim() || submitting}
              style={{ padding: 10, border: 0, borderRadius: 7, background: 'var(--accent)', color: 'var(--accent-text)', fontWeight: 700, cursor: 'pointer' }}>
              {submitting ? 'Creating…' : 'Create server'}
            </button>
          </form>
        </HeaderPanel>
      )}

      {action === 'join' && (
        <HeaderPanel title="Join a server" onClose={() => setAction(null)}>
          <form onSubmit={handleJoinServer} style={{ padding: 16, display: 'grid', gap: 12 }}>
            <label style={{ display: 'grid', gap: 6, color: 'var(--muted)', fontSize: 13 }}>
              Invite code
              <input autoFocus value={joinCode} onChange={(event) => { setJoinCode(event.target.value); setJoinPreview(null); }}
                style={{ padding: '10px 11px', border: '1px solid var(--border)', borderRadius: 7, background: 'var(--input-bg)', color: 'var(--text)', font: 'inherit' }} />
            </label>
            {joinPreview && <div style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 7 }}><strong>{joinPreview.server.name}</strong><div style={{ color: 'var(--muted)', fontSize: 13 }}>Confirm that this is the server you want to join.</div></div>}
            {actionError && <div role="alert" style={{ color: 'var(--danger)', fontSize: 13 }}>{actionError}</div>}
            <button type="submit" disabled={!joinCode.trim() || submitting}
              style={{ padding: 10, border: 0, borderRadius: 7, background: 'var(--accent)', color: 'var(--accent-text)', fontWeight: 700, cursor: 'pointer' }}>
              {submitting ? 'Checking…' : joinPreview ? 'Join server' : 'Review server'}
            </button>
          </form>
        </HeaderPanel>
      )}
    </div>
  );
}
