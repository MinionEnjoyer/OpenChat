import { useEffect, useRef, useState } from 'react';
import type { LibraryItem } from '../lib/types';
import { watchpartySearch } from '../lib/api';

function fmtRuntime(ms: number | null): string {
  if (!ms) return '';
  const min = Math.round(ms / 60000);
  const h = Math.floor(min / 60);
  return h ? `${h}h ${min % 60}m` : `${min}m`;
}

export function WatchPartyPicker({ onPick, onClose }: { onPick: (item: LibraryItem) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pressed = useRef(false);

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
          <h2 style={{ margin: 0, fontSize: 18, color: 'var(--text-strong)' }}>🎬 Start a Watch Party</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 22, cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ padding: 16 }}>
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search Jellyfin library…"
            style={{ width: '100%', padding: '10px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', outline: 'none' }} />
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
