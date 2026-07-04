import React from 'react';
import { createInvite, acceptInvite, getInvite } from '../lib/social';
import { createServer } from '../lib/api';

export function ServerActions({
  activeServerId,
  onChanged,
}: {
  activeServerId: string | null;
  onChanged: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [inviteCode, setInviteCode] = React.useState<string | null>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const handleCreateServer = async () => {
    setOpen(false);
    const name = window.prompt('Name your server:');
    if (!name) return;
    try {
      await createServer(name);
      onChanged();
    } catch {
      alert('Failed to create server.');
    }
  };

  const handleJoinServer = async () => {
    setOpen(false);
    const code = window.prompt('Enter an invite code:');
    if (!code) return;
    try {
      // Preview the server before committing to join.
      const preview = await getInvite(code.trim());
      if (!window.confirm(`Join "${preview.server.name}"?`)) return;
      await acceptInvite(code.trim());
      onChanged();
    } catch {
      alert('Invalid or expired invite code.');
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
          <button style={menuItem} onClick={handleCreateServer}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}>
            ✨ Create a Server
          </button>
          <button style={menuItem} onClick={handleJoinServer}
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
    </div>
  );
}
