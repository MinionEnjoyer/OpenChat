import type { User } from '../lib/types';
import { Avatar } from './Avatar';

export function UserPanel({ user, onOpenSettings }: { user: User; onOpenSettings: () => void }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 10px',
        background: 'var(--panel-dark)',
        borderTop: '1px solid var(--border)',
      }}
    >
      <Avatar user={user} size={32} showStatus />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontWeight: 600,
            fontSize: 14,
            color: 'var(--text-strong)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {user.displayName || user.username}
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{user.status || 'online'}</div>
      </div>
      <button
        onClick={onOpenSettings}
        title="User Settings"
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--muted)',
          cursor: 'pointer',
          fontSize: 18,
          padding: 4,
          borderRadius: 4,
          flexShrink: 0,
        }}
      >
        ⚙️
      </button>
    </div>
  );
}
