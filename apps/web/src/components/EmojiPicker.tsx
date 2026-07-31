import { useEffect, useRef, useState } from 'react';
import { getTheme } from '../lib/theme';
import { OpenChatSpinner } from './OpenChatSpinner';

const W = 352;
const H = 440;

/**
 * Floating emoji picker (emoji-mart with a bundled local dataset — native platform emojis,
 * no external CDN). The picker library + its large dataset are code-split and loaded on
 * first open so they stay out of the initial bundle. Closes on outside click or Escape.
 */
export function EmojiPicker({
  onSelect,
  onClose,
}: {
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

  return (
    <>
    <div className="chat-option-backdrop" aria-hidden="true" />
    <div ref={ref} className="chat-option-dialog" role="dialog" aria-modal="true" aria-label="Choose an emoji" style={{ width: W, height: `min(${H}px, calc(100dvh - 24px))` }}>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <OpenChatSpinner size={34} label="Loading emojis" />
            Loading emojis…
          </div>
        </div>
      )}
    </div>
    </>
  );
}
