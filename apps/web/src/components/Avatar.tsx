import type { User } from '../lib/types';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

const STATUS_COLOR: Record<string, string> = {
  ONLINE: '#3ba55d',
  AWAY: '#faa61a',
  DND: '#ed4245',
  INVISIBLE: '#747f8d',
  OFFLINE: '#747f8d',
};

export function Avatar({
  user,
  size = 40,
  showStatus = false,
}: {
  user: (Pick<User, 'username' | 'displayName' | 'avatarUrl'> & { status?: string }) | null | undefined;
  size?: number;
  showStatus?: boolean;
}) {
  const name = user?.displayName || user?.username || 'user';
  const common: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: '50%',
    flexShrink: 0,
    objectFit: 'cover',
  };
  const inner = user?.avatarUrl ? (
    <img src={user.avatarUrl} alt={name} style={common} />
  ) : (
    <div
      style={{
        ...common,
        background: 'var(--accent)',
        color: 'var(--accent-text)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.38,
        fontWeight: 600,
      }}
    >
      {initials(name)}
    </div>
  );

  if (!showStatus) return inner;

  const dot = Math.max(10, Math.round(size * 0.3));
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      {inner}
      <span
        title={user?.status || 'OFFLINE'}
        style={{
          position: 'absolute', right: -1, bottom: -1, width: dot, height: dot, borderRadius: '50%',
          background: STATUS_COLOR[user?.status || 'OFFLINE'] || STATUS_COLOR.OFFLINE,
          border: '2px solid var(--panel)', boxSizing: 'border-box',
        }}
      />
    </div>
  );
}
