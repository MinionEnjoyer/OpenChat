import { useEffect, useRef, useState } from 'react';
import type { ServerSticker } from '../lib/types';
import * as api from '../lib/api';
import { uploadToShare } from '../lib/share';
import { OpenChatSpinner } from './OpenChatSpinner';
import { SpinnerImage } from './SpinnerImage';
import { mediaUrl } from '../lib/serverConfig';

/**
 * Composer sticker popover: send one of the server's custom stickers (an uploaded image sent
 * as an image message, like a GIF). Users with Manage Channels can add/remove stickers here.
 */
export function StickerPicker({ serverId, canManage, onSelect, onClose }: {
  serverId: string;
  canManage: boolean;
  onSelect: (url: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [stickers, setStickers] = useState<ServerSticker[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [manage, setManage] = useState(false);

  async function load() { try { setStickers(await api.listStickers(serverId)); } catch { /* ignore */ } finally { setLoading(false); } }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [serverId]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [onClose]);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    const name = (prompt('Sticker name?', f.name.replace(/\.[^.]+$/, '').slice(0, 40)) || '').trim();
    if (!name) return;
    setUploading(true);
    try {
      const { attachments, rejected } = await uploadToShare([f]);
      const url = attachments[0]?.url;
      if (!url) throw new Error(rejected?.[0]?.reason || 'the file type was not accepted');
      const st = await api.addSticker(serverId, { name, url });
      setStickers((p) => [...p, st]);
    } catch (e: any) { alert(`Could not add sticker: ${e?.message || 'unknown error'}`); }
    finally { setUploading(false); }
  }
  async function remove(id: string) {
    setStickers((p) => p.filter((s) => s.id !== id));
    try { await api.deleteSticker(serverId, id); } catch { load(); }
  }

  return (
    <>
    <div className="chat-option-backdrop" aria-hidden="true" />
    <div ref={ref} className="chat-option-dialog" role="dialog" aria-modal="true" aria-label="Choose a sticker"
      style={{ width: 320, height: 360, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 6px 24px rgba(0,0,0,0.35)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-strong)' }}>Stickers</span>
        {canManage && <button onClick={() => setManage((m) => !m)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 12 }}>{manage ? 'Done' : 'Manage'}</button>}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 10, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {loading && <div style={{ gridColumn: '1/-1', display: 'flex', justifyContent: 'center', padding: 18 }}><OpenChatSpinner size={36} label="Loading stickers" /></div>}
        {!loading && stickers.length === 0 && (
          <div style={{ gridColumn: '1/-1', color: 'var(--muted)', fontSize: 13 }}>
            {canManage ? 'No stickers yet — add one below.' : 'No stickers on this server yet.'}
          </div>
        )}
        {stickers.map((s) => (
          <div key={s.id} title={s.name} style={{ position: 'relative' }}>
            <SpinnerImage src={mediaUrl(s.url)} alt={s.name} spinnerSize={22} wrapperStyle={{ width: '100%', height: 60 }}
              onClick={() => { if (!manage) onSelect(s.url); }}
              style={{ width: '100%', height: 60, objectFit: 'contain', borderRadius: 6, cursor: manage ? 'default' : 'pointer', background: 'var(--input-bg)' }} />
            {manage && (
              <button onClick={() => remove(s.id)} title="Delete"
                style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%', border: 'none', background: 'var(--danger)', color: '#fff', cursor: 'pointer', fontSize: 12, lineHeight: 1 }}>×</button>
            )}
          </div>
        ))}
      </div>
      {canManage && (
        <div style={{ padding: 8, borderTop: '1px solid var(--border)' }}>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={pick} />
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            style={{ width: '100%', padding: '7px 0', borderRadius: 6, border: '1px dashed var(--border)', background: 'none', color: 'var(--text)', cursor: uploading ? 'default' : 'pointer', fontSize: 13 }}>
            {uploading ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><OpenChatSpinner size={18} label="Uploading sticker" /> Uploading…</span> : '＋ Add sticker'}
          </button>
        </div>
      )}
    </div>
    </>
  );
}
