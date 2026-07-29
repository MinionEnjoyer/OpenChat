import { Avatar } from './Avatar';
import { BotBadge } from './BotBadge';

const STATUS_LABEL: Record<string, string> = {
  ONLINE: 'Online', AWAY: 'Away', DND: 'Do Not Disturb', INVISIBLE: 'Offline', OFFLINE: 'Offline',
};

// A loose user shape so both member-list rows and the full User type can be passed in.
export interface ProfileUser {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  status?: string;
  customStatus?: string | null;
  bio?: string | null;
  platforms?: string[];
  isBot?: boolean;
}

/** Read-only profile popover: avatar, name, @handle, presence, custom status, and About Me. */
export function ProfileCard({ user, onClose }: { user: ProfileUser; onClose: () => void }) {
  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 340, background: 'var(--panel)', borderRadius: 12, overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
        <div style={{ height: 60, background: 'var(--panel-dark)' }} />
        <div style={{ padding: '0 20px 20px', marginTop: -30 }}>
          <Avatar user={user} size={72} showStatus />
          <div style={{ marginTop: 10, fontSize: 20, fontWeight: 700, color: 'var(--text-strong)', wordBreak: 'break-word' }}>
            {user.displayName || user.username}{user.isBot && <BotBadge />}
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>@{user.username}</div>
          {user.customStatus && (
            <div style={{ marginTop: 10, fontSize: 14, color: 'var(--text)', wordBreak: 'break-word' }}>{user.customStatus}</div>
          )}
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)' }}>{STATUS_LABEL[user.status || 'OFFLINE'] || 'Offline'}</div>
          {user.bio && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--muted)', marginBottom: 6, fontWeight: 700 }}>About Me</div>
              <div style={{ fontSize: 14, color: 'var(--text)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.4 }}>{user.bio}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
