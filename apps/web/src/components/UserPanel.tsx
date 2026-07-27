import { useState } from 'react';
import type { User } from '../lib/types';
import { Avatar } from './Avatar';
import { Icon } from './Icon';

const STATUS_OPTIONS: { value: string; label: string; color: string }[] = [
  { value: 'ONLINE', label: 'Online', color: '#3ba55d' },
  { value: 'AWAY', label: 'Away', color: '#faa61a' },
  { value: 'DND', label: 'Do Not Disturb', color: '#ed4245' },
  { value: 'INVISIBLE', label: 'Invisible', color: '#747f8d' },
];

const STATUS_LABEL: Record<string, string> = {
  ONLINE: 'Online', AWAY: 'Away', DND: 'Do Not Disturb', INVISIBLE: 'Invisible', OFFLINE: 'Offline',
};

export function UserPanel({
  user,
  onOpenSettings,
  onSetStatus,
}: {
  user: User;
  onOpenSettings: () => void;
  onSetStatus: (status: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 10px',
        background: 'var(--panel-dark)',
        borderTop: '1px solid var(--border)',
        position: 'relative',
      }}
    >
      <Avatar user={user} size={32} showStatus />
      {/* Click the name/status to open the quick status picker. */}
      <button
        onClick={() => setMenuOpen((o) => !o)}
        title="Set status"
        style={{ flex: 1, minWidth: 0, background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', padding: 0 }}
      >
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
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{STATUS_LABEL[user.status || 'ONLINE'] || 'Online'}</div>
      </button>
      <button
        onClick={onOpenSettings}
        title="User Settings"
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--muted)',
          cursor: 'pointer',
          padding: 4,
          borderRadius: 4,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <Icon name="settings" size={20} alt="Settings" />
      </button>

      {menuOpen && (
        <>
          <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div
            style={{
              position: 'absolute', bottom: 'calc(100% + 4px)', left: 8, right: 8, zIndex: 41,
              background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8,
              boxShadow: '0 6px 24px rgba(0,0,0,0.35)', overflow: 'hidden', padding: 4,
            }}
          >
            {STATUS_OPTIONS.map((o) => (
              <button
                key={o.value}
                onClick={() => { setMenuOpen(false); if (o.value !== user.status) onSetStatus(o.value); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                  padding: '8px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13,
                  background: o.value === user.status ? 'var(--hover)' : 'none', color: 'var(--text)',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = o.value === user.status ? 'var(--hover)' : 'none')}
              >
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: o.color, flexShrink: 0 }} />
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
