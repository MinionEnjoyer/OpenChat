import { useRef, useState } from 'react';
import type { User } from '../lib/types';
import type { Theme } from '../lib/theme';
import { updateProfile } from '../lib/api';
import { uploadToShare } from '../lib/share';
import { Avatar } from './Avatar';
import { VoiceSettings, type AudioControls } from './VoiceSettings';

export function SettingsModal({
  user,
  theme,
  shareBaseUrl,
  audio,
  onThemeChange,
  onSaved,
  onClose,
}: {
  user: User;
  theme: Theme;
  shareBaseUrl: string;
  audio: AudioControls;
  onThemeChange: (t: Theme) => void;
  onSaved: (u: User) => void;
  onClose: () => void;
}) {
  const [username, setUsername] = useState(user.username);
  const [displayName, setDisplayName] = useState(user.displayName || '');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user.avatarUrl);
  const [status, setStatus] = useState(user.status || 'ONLINE');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'profile' | 'appearance' | 'voice'>('profile');
  const fileRef = useRef<HTMLInputElement>(null);
  const pressedOnOverlay = useRef(false);

  const previewUser = { ...user, username, displayName: displayName || null, avatarUrl };

  function extractError(err: any): string {
    const raw = String(err?.message ?? 'Failed to save.');
    const m = raw.match(/\{.*\}/);
    if (m) {
      try {
        const body = JSON.parse(m[0]);
        if (typeof body.message === 'string') return body.message;
        if (Array.isArray(body.message)) return body.message.join(', ');
      } catch { /* fall through */ }
    }
    return raw;
  }

  function copyCode() {
    if (!user.friendCode) return;
    navigator.clipboard?.writeText(user.friendCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function handleAvatarFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!shareBaseUrl) {
      setError('Image hosting (Share) is not configured.');
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const { attachments } = await uploadToShare([file], shareBaseUrl);
      if (attachments[0]) setAvatarUrl(attachments[0].url);
      else setError('Upload was rejected.');
    } catch (err: any) {
      setError(err?.message || 'Avatar upload failed.');
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateProfile({
        username: username.trim(),
        displayName: displayName.trim(),
        avatarUrl: avatarUrl || '',
        status,
      });
      onSaved(updated);
      onClose();
    } catch (err: any) {
      setError(extractError(err));
    } finally {
      setSaving(false);
    }
  }

  const label: React.CSSProperties = {
    display: 'block',
    fontSize: 12,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    color: 'var(--muted)',
    marginBottom: 8,
  };
  const input: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 4,
    border: '1px solid var(--border)',
    background: 'var(--input-bg)',
    color: 'var(--text)',
    outline: 'none',
    fontSize: 14,
  };
  const themeBtn = (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: '10px',
    borderRadius: 6,
    border: active ? '2px solid var(--accent)' : '2px solid var(--border)',
    background: 'var(--input-bg)',
    color: 'var(--text)',
    cursor: 'pointer',
    fontWeight: 600,
  });

  return (
    <div
      onMouseDown={(e) => { pressedOnOverlay.current = e.target === e.currentTarget; }}
      onClick={(e) => { if (e.target === e.currentTarget && pressedOnOverlay.current) onClose(); }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: 16,
      }}
    >
      <div
        style={{
          background: 'var(--panel)',
          color: 'var(--text)',
          borderRadius: 10,
          width: '100%',
          maxWidth: 460,
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: 24,
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 20, color: 'var(--text-strong)' }}>Settings</h2>
          <button onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 22, cursor: 'pointer' }}>×</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 20, borderBottom: '1px solid var(--border)' }}>
          {([['profile', '👤 Profile'], ['appearance', '🎨 Appearance'], ['voice', '🎙 Voice & Video']] as const).map(([val, lbl]) => (
            <button key={val} onClick={() => setTab(val)}
              style={{ padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14,
                fontWeight: tab === val ? 700 : 500, color: tab === val ? 'var(--text-strong)' : 'var(--muted)',
                borderBottom: '2px solid ' + (tab === val ? 'var(--accent)' : 'transparent'), marginBottom: -1 }}>
              {lbl}
            </button>
          ))}
        </div>

        {tab === 'appearance' && (
          <div style={{ marginBottom: 8 }}>
            <span style={label}>Theme</span>
            <div style={{ display: 'flex', gap: 10 }}>
              <button style={themeBtn(theme === 'dark')} onClick={() => onThemeChange('dark')}>🌙 Dark</button>
              <button style={themeBtn(theme === 'light')} onClick={() => onThemeChange('light')}>☀️ Light</button>
            </div>
          </div>
        )}

        {tab === 'voice' && <VoiceSettings audio={audio} label={label} input={input} />}

        {tab === 'profile' && (
          <>
            {shareBaseUrl && (
              <div style={{ marginBottom: 24 }}>
                <span style={label}>Profile Picture</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <Avatar user={previewUser} size={64} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleAvatarFile} />
                    <button onClick={() => fileRef.current?.click()} disabled={uploading}
                      style={{ padding: '8px 14px', borderRadius: 4, border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', cursor: uploading ? 'default' : 'pointer', fontWeight: 600 }}>
                      {uploading ? 'Uploading…' : 'Change Avatar'}
                    </button>
                    {avatarUrl && (
                      <button onClick={() => setAvatarUrl(null)}
                        style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 12 }}>Remove</button>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div style={{ marginBottom: 24 }}>
              <span style={label}>Username</span>
              <input style={input} value={username} maxLength={32} onChange={(e) => setUsername(e.target.value)} placeholder="your_handle" />
              <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--muted)' }}>
                Your global @handle — used when friends add you by name. 3–32 chars: letters, numbers, . _ -
              </p>
            </div>

            <div style={{ marginBottom: 24 }}>
              <span style={label}>Display Name <span style={{ textTransform: 'none', fontWeight: 400 }}>(optional)</span></span>
              <input style={input} value={displayName} maxLength={80} onChange={(e) => setDisplayName(e.target.value)} placeholder={username} />
            </div>

            <div style={{ marginBottom: 24 }}>
              <span style={label}>Status</span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {([
                  ['ONLINE', '🟢 Online'],
                  ['AWAY', '🟡 Away'],
                  ['DND', '🔴 Do Not Disturb'],
                  ['INVISIBLE', '⚫ Invisible'],
                ] as const).map(([val, lbl]) => (
                  <button key={val} onClick={() => setStatus(val)}
                    style={{ padding: '8px 12px', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13,
                      background: 'var(--input-bg)', color: 'var(--text)',
                      border: status === val ? '2px solid var(--accent)' : '2px solid var(--border)' }}>
                    {lbl}
                  </button>
                ))}
              </div>
            </div>

            {user.friendCode && (
              <div style={{ marginBottom: 24 }}>
                <span style={label}>Your Friend Code</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <code style={{ flex: 1, padding: '10px 12px', borderRadius: 4, background: 'var(--input-bg)', color: 'var(--text-strong)', fontSize: 20, letterSpacing: 3, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                    {user.friendCode}
                  </code>
                  <button onClick={copyCode}
                    style={{ padding: '10px 16px', borderRadius: 4, border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', cursor: 'pointer', fontWeight: 600 }}>
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--muted)' }}>Share this code so others can add you as a friend.</p>
              </div>
            )}

            {error && <p style={{ color: 'var(--danger)', marginTop: 0, marginBottom: 16 }}>{error}</p>}
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          {tab === 'profile' ? (
            <>
              <button onClick={onClose}
                style={{ padding: '10px 16px', borderRadius: 4, border: 'none', background: 'transparent', color: 'var(--text)', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleSave} disabled={saving}
                style={{ padding: '10px 20px', borderRadius: 4, border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', cursor: saving ? 'default' : 'pointer', fontWeight: 600 }}>
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </>
          ) : (
            <button onClick={onClose}
              style={{ padding: '10px 20px', borderRadius: 4, border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', cursor: 'pointer', fontWeight: 600 }}>Done</button>
          )}
        </div>
      </div>
    </div>
  );
}
