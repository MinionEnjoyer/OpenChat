import { useEffect, useRef, useState } from 'react';
import type { ServerSound } from '../lib/types';
import * as api from '../lib/api';
import { uploadToShare } from '../lib/share';
import { EmojiPicker } from './EmojiPicker';

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
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmoji, setEditEmoji] = useState('');
  const [picker, setPicker] = useState<{ target: 'add' | 'edit'; x: number; y: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pressedOverlay = useRef(false);

  async function load() {
    try { setSounds(await api.listSounds(serverId)); } catch { /* ignore */ } finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [serverId]);

  const q = search.trim().toLowerCase();
  const filtered = q ? sounds.filter((s) => s.name.toLowerCase().includes(q)) : sounds;
  const editSound = editing ? sounds.find((s) => s.id === editing) : null;

  function startEdit(s: ServerSound) { setEditing(s.id); setEditName(s.name); setEditEmoji(s.emoji || ''); }
  async function saveEdit(id: string) {
    const name = editName.trim();
    if (!name) return;
    const emoji = editEmoji.trim() || null;
    setSounds((prev) => prev.map((s) => (s.id === id ? { ...s, name, emoji } : s)));
    setEditing(null);
    try { await api.updateSound(serverId, id, { name, emoji }); } catch { load(); }
  }

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
          <>
            {sounds.length > 4 && (
              <input
                style={{ ...input, width: '100%', boxSizing: 'border-box', marginBottom: 12 }}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search sounds…"
              />
            )}
            {filtered.length === 0 ? (
              <p style={{ color: 'var(--muted-2)', fontStyle: 'italic', fontSize: 14 }}>No sounds match “{search.trim()}”.</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(132px, 1fr))', gap: 10 }}>
                {filtered.map((s) => (
                  <div key={s.id} style={{ position: 'relative' }}>
                    <button onClick={() => onPlay(s.url)} title={`Play ${s.name}`}
                      style={{ width: '100%', padding: '16px 8px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', cursor: 'pointer', fontWeight: 600, fontSize: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 30, lineHeight: 1 }}>{s.emoji || '🔊'}</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{s.name}</span>
                    </button>
                    {canManage && (
                      <>
                        <button onClick={() => startEdit(s)} title="Rename / change emoji"
                          style={{ position: 'absolute', top: -7, left: -7, width: 24, height: 24, borderRadius: '50%', border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)', cursor: 'pointer', fontSize: 12, lineHeight: 1, boxShadow: '0 1px 4px rgba(0,0,0,0.35)' }}>✎</button>
                        <button onClick={() => remove(s.id)} title="Delete"
                          style={{ position: 'absolute', top: -7, right: -7, width: 24, height: 24, borderRadius: '50%', border: 'none', background: 'var(--danger)', color: '#fff', cursor: 'pointer', fontSize: 14, lineHeight: 1, boxShadow: '0 1px 4px rgba(0,0,0,0.35)' }}>×</button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
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
                  <button type="button" title="Pick emoji"
                    onClick={(e) => setPicker({ target: 'add', x: e.clientX, y: e.clientY })}
                    style={{ ...input, width: 56, textAlign: 'center', padding: '4px 0', fontSize: 20, cursor: 'pointer' }}>{emoji || '🔊'}</button>
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

      {editSound && (
        <div
          onMouseDown={(e) => { if (e.target === e.currentTarget) setEditing(null); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1, padding: 16 }}
        >
          <div style={{ background: 'var(--panel)', color: 'var(--text)', borderRadius: 12, width: '100%', maxWidth: 400, padding: 24, boxShadow: '0 10px 40px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 17, color: 'var(--text-strong)' }}>Edit sound</h3>
              <button onClick={() => setEditing(null)} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>

            <div style={{ display: 'flex', gap: 18, alignItems: 'center', marginBottom: 20 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <button type="button" title="Pick emoji"
                  onClick={(e) => setPicker({ target: 'edit', x: e.clientX, y: e.clientY })}
                  style={{ width: 76, height: 76, borderRadius: 14, border: '1px solid var(--border)', background: 'var(--input-bg)', cursor: 'pointer', fontSize: 40, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {editEmoji || '🔊'}
                </button>
                <span style={{ fontSize: 11, color: 'var(--muted-2)' }}>Emoji</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--muted)', marginBottom: 6 }}>Name</label>
                <input style={{ ...input, width: '100%', boxSizing: 'border-box', fontSize: 15, padding: '10px 12px' }} value={editName} maxLength={40} autoFocus
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(editSound.id); if (e.key === 'Escape') setEditing(null); }} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setEditing(null)}
                style={{ padding: '9px 18px', borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', cursor: 'pointer', fontSize: 14 }}>Cancel</button>
              <button onClick={() => saveEdit(editSound.id)} disabled={!editName.trim()}
                style={{ padding: '9px 20px', borderRadius: 7, border: 'none', background: editName.trim() ? 'var(--accent)' : 'var(--panel-dark)', color: editName.trim() ? 'var(--accent-text)' : 'var(--muted-2)', cursor: editName.trim() ? 'pointer' : 'default', fontSize: 14, fontWeight: 600 }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {picker && (
        <EmojiPicker
          anchor={{ x: picker.x, y: picker.y }}
          onSelect={(em) => { if (picker.target === 'add') setEmoji(em); else setEditEmoji(em); setPicker(null); }}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}
