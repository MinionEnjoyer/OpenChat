import { useEffect, useRef } from 'react';
import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';
import { getTheme } from '../lib/theme';

const W = 352;
const H = 440;

/**
 * Floating emoji picker (emoji-mart with a bundled local dataset — native platform emojis,
 * no external CDN). Positioned near an anchor point; closes on outside click or Escape.
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
      <Picker
        data={data}
        onEmojiSelect={(e: any) => onSelect(e.native)}
        theme={getTheme() === 'light' ? 'light' : 'dark'}
        previewPosition="none"
        skinTonePosition="none"
      />
    </div>
  );
}
