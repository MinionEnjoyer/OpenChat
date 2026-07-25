import { useEffect, useRef, useState } from 'react';
import type { LibraryItem } from '../lib/types';
import { watchpartySearch } from '../lib/api';
import { Icon } from './Icon';

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
    const t = setTimeout(async () => {
      try {
        const res = await watchpartySearch(q);
        if (!cancelled) setItems(res);
      } catch (e: any) {
        if (!cancelled) setError(e?.message?.replace(/^API Error \d+:\s*/, '') || 'Search failed.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q]);

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
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px' }}>
          {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
          {loading && items.length === 0 && <p style={{ color: 'var(--muted)' }}>Loading…</p>}
          {!loading && items.length === 0 && !error && <p style={{ color: 'var(--muted)' }}>No results.</p>}
          {items.map((it) => (
            <div key={it.id} onClick={() => onPick(it)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 8, borderRadius: 6, cursor: 'pointer' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
              <div style={{ width: 46, height: 68, borderRadius: 4, background: 'var(--panel-dark)', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {it.imageUrl ? <img src={it.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span>🎞️</span>}
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
