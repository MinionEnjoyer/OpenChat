import { useEffect, useRef, useState } from 'react';
import type { ServerSound } from '../lib/types';
import * as api from '../lib/api';
import { uploadToShare } from '../lib/share';

const MAX_SOUND_MB = 5;
const MAX_SOUND_BYTES = MAX_SOUND_MB * 1024 * 1024;

/** In-call soundboard: click a clip to play it into the voice room; managers can add/remove. */
export function Soundboard({ serverId, canManage, shareBaseUrl, onPlay, onClose }: {
  serverId: string;
  canManage: boolean;
  shareBaseUrl: string;
  onPlay: (url: string) => void;
  onClose: () => void;
}) {
  const [sounds, setSounds] = useState<ServerSound[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pressedOverlay = useRef(false);

  async function load() {
    try { setSounds(await api.listSounds(serverId)); } catch { /* ignore */ } finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [serverId]);

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > MAX_SOUND_BYTES) {
      alert(`That file is ${(f.size / 1024 / 1024).toFixed(1)} MB — sounds must be ${MAX_SOUND_MB} MB or less.`);
      return;
    }
    setFile(f);
    if (!name.trim()) setName(f.name.replace(/\.[^.]+$/, '').slice(0, 40));
  }
  async function upload() {
    if (!file || !name.trim() || !shareBaseUrl) return;
    if (file.size > MAX_SOUND_BYTES) { alert(`Sounds must be ${MAX_SOUND_MB} MB or less.`); return; }
    setUploading(true);
    try {
      const { attachments } = await uploadToShare([file], shareBaseUrl);
      const url = attachments[0]?.url;
      if (!url) throw new Error('upload rejected');
      const s = await api.addSound(serverId, { name: name.trim(), url, emoji: emoji.trim() || null });
      setSounds((prev) => [...prev, s]);
      setFile(null); setName(''); setEmoji('');
    } catch {
      alert('Could not add sound (audio only, must be small).');
    } finally { setUploading(false); }
  }
  async function remove(id: string) {
    setSounds((prev) => prev.filter((s) => s.id !== id));
    try { await api.deleteSound(serverId, id); } catch { load(); }
  }

  const input: React.CSSProperties = { padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', outline: 'none', fontSize: 14 };

  return (
    <div
      onMouseDown={(e) => { pressedOverlay.current = e.target === e.currentTarget; }}
      onClick={(e) => { if (e.target === e.currentTarget && pressedOverlay.current) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}
    >
      <div style={{ background: 'var(--panel)', color: 'var(--text)', borderRadius: 10, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto', padding: 22, boxShadow: '0 8px 32px rgba(0,0,0,0.45)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 19, color: 'var(--text-strong)' }}>Soundboard</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 22, cursor: 'pointer' }}>×</button>
        </div>

        {loading ? (
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>Loading…</p>
        ) : sounds.length === 0 ? (
          <p style={{ color: 'var(--muted-2)', fontStyle: 'italic', fontSize: 14 }}>No sounds yet{canManage ? ' — add one below.' : '.'}</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
            {sounds.map((s) => (
              <div key={s.id} style={{ position: 'relative' }}>
                <button onClick={() => onPlay(s.url)} title={`Play ${s.name}`}
                  style={{ width: '100%', padding: '12px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', cursor: 'pointer', fontWeight: 600, fontSize: 13, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 20, lineHeight: 1 }}>{s.emoji || '🔊'}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{s.name}</span>
                </button>
                {canManage && (
                  <button onClick={() => remove(s.id)} title="Delete"
                    style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', border: 'none', background: 'var(--danger)', color: '#fff', cursor: 'pointer', fontSize: 12, lineHeight: 1 }}>×</button>
                )}
              </div>
            ))}
          </div>
        )}

        {canManage && (
          <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--muted)', marginBottom: 8 }}>Add a sound</div>
            {!shareBaseUrl ? (
              <p style={{ fontSize: 13, color: 'var(--muted)' }}>File hosting (Share) isn't configured, so sounds can't be uploaded.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input ref={fileRef} type="file" accept="audio/*" hidden onChange={pickFile} />
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <button onClick={() => fileRef.current?.click()}
                    style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', cursor: 'pointer', fontSize: 13, flexShrink: 0 }}>
                    {file ? '🎵 ' + file.name.slice(0, 24) : 'Choose audio…'}
                  </button>
                  <span style={{ fontSize: 12, color: 'var(--muted-2)' }}>Audio, up to {MAX_SOUND_MB} MB</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input style={{ ...input, width: 56, textAlign: 'center' }} value={emoji} maxLength={4} onChange={(e) => setEmoji(e.target.value)} placeholder="🔊" />
                  <input style={{ ...input, flex: 1 }} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="Sound name" />
                  <button onClick={upload} disabled={!file || !name.trim() || uploading}
                    style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: (file && name.trim() && !uploading) ? 'var(--accent)' : 'var(--panel-dark)', color: (file && name.trim() && !uploading) ? 'var(--accent-text)' : 'var(--muted-2)', cursor: (file && name.trim() && !uploading) ? 'pointer' : 'default', fontWeight: 600, flexShrink: 0 }}>
                    {uploading ? 'Adding…' : 'Add'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
