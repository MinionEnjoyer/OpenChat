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
  user: (Pick<User, 'username' | 'displayName' | 'avatarUrl'> & { status?: string; platforms?: string[] }) | null | undefined;
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

  const status = user?.status || 'OFFLINE';
  const color = STATUS_COLOR[status] || STATUS_COLOR.OFFLINE;
  const platforms = user?.platforms || [];
  // Discord-style: a phone badge only when the user is active on mobile *and not* desktop/web.
  const mobileOnly = platforms.length > 0 && !platforms.includes('desktop') && !platforms.includes('web');
  const dot = Math.max(10, Math.round(size * 0.3));

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      {inner}
      {mobileOnly ? (
        <span
          title={`${status} · mobile`}
          style={{
            position: 'absolute', right: -3, bottom: -3, width: Math.max(12, Math.round(size * 0.36)),
            height: Math.max(12, Math.round(size * 0.36)), borderRadius: 3, background: 'var(--panel)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box',
          }}
        >
          <svg viewBox="0 0 24 24" width="72%" height="72%" fill={color} aria-label="on mobile">
            <rect x="6" y="2" width="12" height="20" rx="2.5" />
            <rect x="10" y="18.5" width="4" height="1.6" rx="0.8" fill="var(--panel)" />
          </svg>
        </span>
      ) : (
        <span
          title={status}
          style={{
            position: 'absolute', right: -1, bottom: -1, width: dot, height: dot, borderRadius: '50%',
            background: color, border: '2px solid var(--panel)', boxSizing: 'border-box',
          }}
        />
      )}
    </div>
  );
}
