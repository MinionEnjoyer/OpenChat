import { useEffect, useRef, useState } from 'react';
import { getTheme } from '../lib/theme';

const W = 352;
const H = 440;

/**
 * Floating emoji picker (emoji-mart with a bundled local dataset — native platform emojis,
 * no external CDN). The picker library + its large dataset are code-split and loaded on
 * first open so they stay out of the initial bundle. Closes on outside click or Escape.
 */
export function EmojiPicker({
  anchor,
  onSelect,
  onClose,
}: {
  anchor: { x: number; y: number };
  onSelect: (emoji: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [mod, setMod] = useState<{ Picker: any; data: any } | null>(null);

  // Lazily pull in emoji-mart (react component + emoji dataset) only when the picker mounts.
  useEffect(() => {
    let cancelled = false;
    Promise.all([import('@emoji-mart/react'), import('@emoji-mart/data')])
      .then(([react, data]) => { if (!cancelled) setMod({ Picker: react.default, data: data.default }); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const t = setTimeout(() => document.addEventListener('mousedown', onDoc), 0);
    document.addEventListener('keydown', onKey);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [onClose]);

  const left = Math.max(8, Math.min(anchor.x - W, window.innerWidth - W - 8));
  const top = anchor.y > window.innerHeight / 2
    ? Math.max(8, anchor.y - H)
    : Math.min(anchor.y + 8, window.innerHeight - H - 8);

  return (
    <div ref={ref} style={{ position: 'fixed', left, top, zIndex: 200 }}>
      {mod ? (
        <mod.Picker
          data={mod.data}
          onEmojiSelect={(e: any) => onSelect(e.native)}
          theme={getTheme() === 'light' ? 'light' : 'dark'}
          previewPosition="none"
          skinTonePosition="none"
        />
      ) : (
        <div style={{ width: W, height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--muted)', fontSize: 13 }}>
          Loading emojis…
        </div>
      )}
    </div>
  );
}
