import { useState } from 'react';
import type { User } from '../lib/types';
import { Avatar } from './Avatar';
import { ProfileCard } from './ProfileCard';

type M = Pick<User, 'id' | 'username' | 'displayName' | 'avatarUrl' | 'customStatus' | 'bio'> & { status?: string };

function isOnline(status?: string): boolean {
  return !!status && status !== 'OFFLINE' && status !== 'INVISIBLE';
}

function Row({ u, dim, onClick }: { u: M; dim?: boolean; onClick: () => void }) {
  return (
    <div onClick={onClick} title={u.customStatus || undefined}
      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 6px', borderRadius: 4, opacity: dim ? 0.45 : 1, cursor: 'pointer' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}>
      <Avatar user={u} size={28} showStatus />
      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)', fontSize: 14 }}>
          {u.displayName || u.username}
        </span>
        {u.customStatus && (
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--muted)', fontSize: 12 }}>
            {u.customStatus}
          </span>
        )}
      </span>
    </div>
  );
}

export function MemberListPanel({ heading, users }: { heading: string; users: M[] }) {
  const [selected, setSelected] = useState<M | null>(null);
  const online = users.filter((u) => isOnline(u.status));
  const offline = users.filter((u) => !isOnline(u.status));

  const groupLabel: React.CSSProperties = {
    fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--muted)', margin: '12px 0 4px', padding: '0 6px',
  };

  return (
    <div className="member-panel" style={{ width: 240, background: 'var(--panel)', borderLeft: '1px solid var(--border)', overflowY: 'auto', flexShrink: 0, padding: 12 }}>
      <div style={{ fontWeight: 700, color: 'var(--text-strong)', padding: '0 6px 4px' }}>{heading}</div>

      {online.length > 0 && (
        <>
          <div style={groupLabel}>Online — {online.length}</div>
          {online.map((u) => <Row key={u.id} u={u} onClick={() => setSelected(u)} />)}
        </>
      )}
      {offline.length > 0 && (
        <>
          <div style={groupLabel}>Offline — {offline.length}</div>
          {offline.map((u) => <Row key={u.id} u={u} dim onClick={() => setSelected(u)} />)}
        </>
      )}
      {users.length === 0 && <div style={{ padding: '4px 6px', color: 'var(--muted-2)', fontSize: 13 }}>No one here.</div>}
      {selected && <ProfileCard user={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
