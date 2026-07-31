import { useEffect, useRef, useState } from 'react';
import type { Gif } from '../lib/types';
import { gifSearch } from '../lib/api';
import { OpenChatSpinner } from './OpenChatSpinner';
import { SpinnerImage } from './SpinnerImage';

const W = 340;
const H = 420;

export function GifPicker({
  onSelect,
  onClose,
}: {
  onSelect: (gif: Gif) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState('');
  const [gifs, setGifs] = useState<Gif[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const t = setTimeout(() => document.addEventListener('mousedown', onDoc), 0);
    document.addEventListener('keydown', onKey);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await gifSearch(q);
        if (!cancelled) { setGifs(res); setError(null); }
      } catch (e: any) {
        if (!cancelled) setError(e?.message?.replace(/^API Error \d+:\s*/, '') || 'GIF search failed.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, q ? 300 : 0);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q]);

  return (
    <>
    <div className="chat-option-backdrop" aria-hidden="true" />
    <div ref={ref} className="chat-option-dialog" role="dialog" aria-modal="true" aria-label="Choose a GIF" style={{ width: W, height: `min(${H}px, calc(100dvh - 24px))`, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: 10 }}>
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search GIFs…"
          style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', outline: 'none' }} />
      </div>
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '0 10px 10px' }}>
        {error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>}
        {loading && gifs.length === 0 && !error && (
          <div style={{ height: 90, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <OpenChatSpinner size={40} label="Loading GIFs" />
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, alignContent: 'start' }}>
          {gifs.map((g) => (
            <SpinnerImage key={g.id} src={g.previewUrl} alt="" loading="lazy" spinnerSize={24}
              wrapperStyle={{ width: '100%', minHeight: 72 }} onClick={() => onSelect(g)}
              style={{ width: '100%', borderRadius: 6, cursor: 'pointer', display: 'block' }} />
          ))}
        </div>
      </div>
      <div style={{ padding: '4px 10px', fontSize: 10, color: 'var(--muted-2)', textAlign: 'right' }}>Powered by GIPHY</div>
    </div>
    </>
  );
}
