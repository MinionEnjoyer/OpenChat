import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { User } from '../lib/types';
import { isTauri } from './TitleBar';
import type { Theme } from '../lib/theme';
import { updateProfile } from '../lib/api';
import { uploadToShare } from '../lib/share';
import { Avatar } from './Avatar';
import { VoiceSettings, type AudioControls } from './VoiceSettings';
import { AppTokens } from './AppTokens';
import { BotsManager } from './BotsManager';
import { DomainSwitcher } from './DomainSwitcher';
import { OpenChatSpinner } from './OpenChatSpinner';
import packageMetadata from '../../package.json';

export function SettingsModal({
  user,
  theme,
  shareBaseUrl,
  audio,
  onThemeChange,
  onSaved,
  onStatusBroadcast,
  onClose,
}: {
  user: User;
  theme: Theme;
  shareBaseUrl: string;
  audio: AudioControls;
  onThemeChange: (t: Theme) => void;
  onSaved: (u: User) => void;
  onStatusBroadcast?: (status: string) => void;
  onClose: () => void;
}) {
  const [username, setUsername] = useState(user.username);
  const [displayName, setDisplayName] = useState(user.displayName || '');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user.avatarUrl);
  const [status, setStatus] = useState(user.status || 'ONLINE');
  const [customStatus, setCustomStatus] = useState(user.customStatus || '');
  const [bio, setBio] = useState(user.bio || '');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'profile' | 'appearance' | 'voice' | 'tokens' | 'bots' | 'servers'>('profile');
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
      const { attachments } = await uploadToShare([file]);
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
        customStatus: customStatus.trim(),
        bio: bio.trim(),
      });
      onSaved(updated);
      // Broadcast the status live over WS so friends/servers see the change immediately
      // (REST persistence alone doesn't notify anyone).
      if (status !== user.status) onStatusBroadcast?.(status);
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
      className="modal-backdrop settings-backdrop"
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
        className="settings-dialog"
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
        <div className="settings-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 className="settings-title" style={{ margin: 0, fontSize: 20, color: 'var(--text-strong)' }}>Settings</h2>
          <button className="settings-close" onClick={onClose} aria-label="Close settings"
            style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 22, cursor: 'pointer' }}>×</button>
        </div>

        {/* Tabs */}
        <div className="settings-tabs" role="tablist" aria-label="Settings sections" style={{ display: 'flex', gap: 6, marginBottom: 20, borderBottom: '1px solid var(--border)' }}>
          {(([['profile', '👤 Profile'], ['appearance', '🎨 Theme'], ['voice', '🎙 Voice'], ['tokens', '🔑 Tokens'], ['bots', '🤖 Bots'], ['servers', '🌐 Servers']]) as [typeof tab, string][]).map(([val, lbl]) => (
            <button className="settings-tab" key={val} role="tab" aria-selected={tab === val}
              aria-controls={`settings-panel-${val}`} data-active={tab === val} onClick={() => setTab(val)}
              style={{ padding: '8px 10px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14,
                fontWeight: tab === val ? 700 : 500, color: tab === val ? 'var(--text-strong)' : 'var(--muted)',
                borderBottom: '2px solid ' + (tab === val ? 'var(--accent)' : 'transparent'), marginBottom: -1 }}>
              {lbl}
            </button>
          ))}
        </div>

        <div className="settings-content">
        {tab === 'appearance' && (
          <div className="settings-panel" id="settings-panel-appearance" role="tabpanel" style={{ marginBottom: 8 }}>
            <span style={label}>Theme</span>
            <div className="settings-theme-grid" style={{ display: 'flex', gap: 10 }}>
              <button style={themeBtn(theme === 'dark')} onClick={() => onThemeChange('dark')}>🌙 Dark</button>
              <button style={themeBtn(theme === 'light')} onClick={() => onThemeChange('light')}>☀️ Light</button>
            </div>
            {isTauri() && <AutostartToggle label={label} />}
          </div>
        )}

        {tab === 'voice' && <div className="settings-panel" id="settings-panel-voice" role="tabpanel"><VoiceSettings audio={audio} label={label} input={input} /></div>}

        {tab === 'tokens' && <div className="settings-panel" id="settings-panel-tokens" role="tabpanel"><AppTokens label={label} input={input} /></div>}

        {tab === 'bots' && <div className="settings-panel" id="settings-panel-bots" role="tabpanel"><BotsManager label={label} input={input} /></div>}

        {tab === 'servers' && <div className="settings-panel" id="settings-panel-servers" role="tabpanel"><DomainSwitcher label={label} /></div>}

        {tab === 'profile' && (
          <div className="settings-panel" id="settings-panel-profile" role="tabpanel">
            {shareBaseUrl && (
              <div className="settings-field" style={{ marginBottom: 24 }}>
                <span style={label}>Profile Picture</span>
                <div className="settings-avatar-row" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <Avatar user={previewUser} size={64} />
                  <div className="settings-avatar-actions" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleAvatarFile} />
                    <button onClick={() => fileRef.current?.click()} disabled={uploading}
                      style={{ padding: '8px 14px', borderRadius: 4, border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', cursor: uploading ? 'default' : 'pointer', fontWeight: 600 }}>
                      {uploading ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><OpenChatSpinner size={18} label="Uploading avatar" /> Uploading…</span> : 'Change Avatar'}
                    </button>
                    {avatarUrl && (
                      <button onClick={() => setAvatarUrl(null)}
                        style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 12 }}>Remove</button>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="settings-field" style={{ marginBottom: 24 }}>
              <span style={label}>Username</span>
              <input style={input} value={username} maxLength={32} onChange={(e) => setUsername(e.target.value)} placeholder="your_handle" />
              <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--muted)' }}>
                Your global @handle — used when friends add you by name. 3–32 chars: letters, numbers, . _ -
              </p>
            </div>

            <div className="settings-field" style={{ marginBottom: 24 }}>
              <span style={label}>Display Name <span style={{ textTransform: 'none', fontWeight: 400 }}>(optional)</span></span>
              <input style={input} value={displayName} maxLength={80} onChange={(e) => setDisplayName(e.target.value)} placeholder={username} />
            </div>

            <div className="settings-field" style={{ marginBottom: 24 }}>
              <span style={label}>Custom Status <span style={{ textTransform: 'none', fontWeight: 400 }}>(optional)</span></span>
              <input style={input} value={customStatus} maxLength={280}
                onChange={(e) => setCustomStatus(e.target.value)} placeholder="What's on your mind?" />
              <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--muted)', textAlign: 'right' }}>{customStatus.length}/280</p>
            </div>

            <div className="settings-field" style={{ marginBottom: 24 }}>
              <span style={label}>About Me <span style={{ textTransform: 'none', fontWeight: 400 }}>(optional)</span></span>
              <textarea style={{ ...input, minHeight: 90, resize: 'vertical', fontFamily: 'inherit' }} value={bio} maxLength={500}
                onChange={(e) => setBio(e.target.value)} placeholder="Tell people a bit about yourself…" />
              <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--muted)', textAlign: 'right' }}>{bio.length}/500</p>
            </div>

            <div className="settings-field" style={{ marginBottom: 24 }}>
              <span style={label}>Status</span>
              <div className="settings-status-grid" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
              <div className="settings-field" style={{ marginBottom: 24 }}>
                <span style={label}>Your Friend Code</span>
                <div className="settings-friend-code" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
          </div>
        )}
        </div>

        <div className="settings-footer">
          <div className="settings-footer-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
            {tab === 'profile' ? (
              <>
                <button onClick={onClose}
                  style={{ padding: '10px 16px', borderRadius: 4, border: 'none', background: 'transparent', color: 'var(--text)', cursor: 'pointer' }}>Cancel</button>
                <button onClick={handleSave} disabled={saving}
                  style={{ padding: '10px 20px', borderRadius: 4, border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', cursor: saving ? 'default' : 'pointer', fontWeight: 600 }}>
                  {saving ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><OpenChatSpinner size={18} label="Saving profile" /> Saving…</span> : 'Save Changes'}
                </button>
              </>
            ) : (
              <button onClick={onClose}
                style={{ padding: '10px 20px', borderRadius: 4, border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', cursor: 'pointer', fontWeight: 600 }}>Done</button>
            )}
          </div>
          <div className="settings-version"
            aria-label={`OpenChat version ${packageMetadata.version}`}
            style={{ marginTop: 14, textAlign: 'center', color: 'var(--muted)', fontSize: 11 }}
          >
            OpenChat v{packageMetadata.version}
          </div>
        </div>
      </div>
    </div>
  );
}

// Desktop "launch at login" toggle. Talks to the Tauri autostart plugin directly (dynamic
// import so the browser build ignores it). Keeping the app running at login is our pragmatic
// stand-in for after-quit push: it stays in the tray with a live socket, so notifications
// keep arriving without the user reopening it. Only rendered inside the desktop shell.
function AutostartToggle({ label }: { label: CSSProperties }) {
  const [enabled, setEnabled] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { isEnabled } = await import('@tauri-apps/plugin-autostart');
        const e = await isEnabled();
        if (alive) { setEnabled(e); setReady(true); }
      } catch { if (alive) setReady(true); }
    })();
    return () => { alive = false; };
  }, []);

  async function toggle() {
    setBusy(true);
    try {
      const mod = await import('@tauri-apps/plugin-autostart');
      if (enabled) { await mod.disable(); setEnabled(false); }
      else { await mod.enable(); setEnabled(true); }
    } catch { /* ignore */ } finally { setBusy(false); }
  }

  return (
    <div style={{ marginTop: 20 }}>
      <span style={label}>Startup</span>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: ready && !busy ? 'pointer' : 'default' }}>
        <input type="checkbox" checked={enabled} disabled={!ready || busy} onChange={toggle} />
        <span style={{ fontSize: 14, color: 'var(--text)' }}>
          Launch OpenChat at login — keeps it in the tray so notifications keep arriving.
        </span>
      </label>
    </div>
  );
}
