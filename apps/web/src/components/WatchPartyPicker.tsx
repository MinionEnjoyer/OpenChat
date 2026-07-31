import { useEffect, useRef, useState } from 'react';
import type { LibraryItem } from '../lib/types';
import { watchpartySearch } from '../lib/api';
import { mediaUrl } from '../lib/serverConfig';
import { Icon } from './Icon';
import { OpenChatSpinner } from './OpenChatSpinner';
import { SpinnerImage } from './SpinnerImage';

function fmtRuntime(ms: number | null): string {
  if (!ms) return '';
  const min = Math.round(ms / 60000);
  const h = Math.floor(min / 60);
  return h ? `${h}h ${min % 60}m` : `${min}m`;
}

/** Extract a YouTube video id from a link (or accept a bare 11-char id). */
function youTubeId(input: string): string | null {
  const s = input.trim();
  try {
    const u = new URL(s);
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null;
    if (host.endsWith('youtube.com') || host === 'youtube-nocookie.com') {
      if (u.pathname === '/watch') return u.searchParams.get('v');
      const m = u.pathname.match(/^\/(embed|shorts|v)\/([^/?]+)/);
      if (m) return m[2];
    }
  } catch { /* not a URL — maybe a bare id */ }
  return /^[A-Za-z0-9_-]{11}$/.test(s) ? s : null;
}

export function WatchPartyPicker({ onPick, onPickYoutube, onClose }: { onPick: (item: LibraryItem) => void; onPickYoutube: (videoId: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [type, setType] = useState<'all' | 'movie' | 'show' | 'music'>('all');
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [yt, setYt] = useState('');
  const [ytErr, setYtErr] = useState<string | null>(null);
  const pressed = useRef(false);

  function submitYt() {
    const id = youTubeId(yt);
    if (!id) { setYtErr('Enter a valid YouTube link.'); return; }
    onPickYoutube(id);
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const t = setTimeout(async () => {
      try {
        const res = await watchpartySearch(q, type);
        if (!cancelled) setItems(res);
      } catch (e: any) {
        if (!cancelled) { setItems([]); setError(e?.message?.replace(/^API Error \d+:\s*/, '') || 'Search failed.'); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q, type]);

  return (
    <div
      onMouseDown={(e) => { pressed.current = e.target === e.currentTarget; }}
      onClick={(e) => { if (e.target === e.currentTarget && pressed.current) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}
    >
      <div style={{ background: 'var(--panel)', color: 'var(--text)', borderRadius: 10, width: '100%', maxWidth: 560, height: '80vh', maxHeight: 640, display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ margin: 0, fontSize: 18, color: 'var(--text-strong)', display: 'flex', alignItems: 'center', gap: 8 }}><Icon name="watchparty" size={20} /> Start a Watch Party</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 22, cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ padding: '16px 16px 0' }}>
          <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>📺 Paste a YouTube link</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input autoFocus value={yt}
              onChange={(e) => { setYt(e.target.value); setYtErr(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') submitYt(); }}
              placeholder="https://youtube.com/watch?v=…"
              style={{ flex: 1, padding: '10px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', outline: 'none' }} />
            <button onClick={submitYt} style={{ padding: '0 18px', borderRadius: 6, border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', cursor: 'pointer', fontWeight: 600 }}>Watch</button>
          </div>
          {ytErr && <p style={{ color: 'var(--danger)', fontSize: 12, margin: '6px 0 0' }}>{ytErr}</p>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0 12px', color: 'var(--muted)', fontSize: 12 }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} /> or search Jellyfin <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search Jellyfin library…"
            style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', outline: 'none' }} />
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            {([['all', 'All'], ['movie', '🎬 Movies'], ['show', '📺 Shows'], ['music', '🎵 Music']] as const).map(([val, lbl]) => (
              <button key={val} onClick={() => setType(val)}
                style={{
                  padding: '5px 12px', borderRadius: 999, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                  border: '1px solid ' + (type === val ? 'var(--accent)' : 'var(--border)'),
                  background: type === val ? 'var(--accent)' : 'var(--input-bg)',
                  color: type === val ? 'var(--accent-text)' : 'var(--text)',
                }}>
                {lbl}
              </button>
            ))}
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px' }}>
          {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
          {loading && items.length === 0 && (
            <div style={{ minHeight: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <OpenChatSpinner size={44} label="Loading watch party library" />
            </div>
          )}
          {!loading && items.length === 0 && !error && <p style={{ color: 'var(--muted)' }}>No results.</p>}
          {items.map((it) => (
            <div key={it.id} onClick={() => onPick(it)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 8, borderRadius: 6, cursor: 'pointer' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
              <div style={{ width: 46, height: 68, borderRadius: 4, background: 'var(--panel-dark)', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {it.imageUrl ? <SpinnerImage src={mediaUrl(it.imageUrl)} alt="" spinnerSize={18} wrapperStyle={{ width: '100%', height: '100%', minWidth: 0, minHeight: 0 }} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span>🎞️</span>}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {it.seriesName ? `${it.seriesName} — ${it.name}` : it.name}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{it.type}{it.runtimeMs ? ` · ${fmtRuntime(it.runtimeMs)}` : ''}</div>
              </div>
              <span style={{ color: 'var(--accent)', fontWeight: 600, fontSize: 13 }}>Watch</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
