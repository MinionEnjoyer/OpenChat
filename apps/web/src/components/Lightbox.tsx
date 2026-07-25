import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

/**
 * Full-screen overlay for viewing an image or video at a larger size. Closes on the ✕,
 * Escape, or a click that starts and ends on the backdrop (so a drag off the media doesn't
 * dismiss it). Portaled to <body> so it escapes the message list's clipping/stacking.
 */
export function Lightbox({
  src,
  mimeType,
  filename,
  onClose,
}: {
  src: string;
  mimeType: string;
  filename: string;
  onClose: () => void;
}) {
  const pressedOnBackdrop = useRef(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const isVideo = mimeType.startsWith('video/');

  return createPortal(
    <div
      onMouseDown={(e) => { pressedOnBackdrop.current = e.target === e.currentTarget; }}
      onClick={(e) => { if (e.target === e.currentTarget && pressedOnBackdrop.current) onClose(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 400,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
    >
      {isVideo ? (
        <video src={src} controls autoPlay style={{ maxWidth: '95vw', maxHeight: '92vh', borderRadius: 6 }} />
      ) : (
        <img src={src} alt={filename} style={{ maxWidth: '95vw', maxHeight: '92vh', objectFit: 'contain', borderRadius: 6 }} />
      )}

      <div style={{ position: 'fixed', top: 14, right: 14, display: 'flex', gap: 8 }}>
        <a
          href={src}
          download={filename}
          onClick={(e) => e.stopPropagation()}
          title="Download"
          style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(0,0,0,0.5)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', fontSize: 17 }}
        >
          ⬇
        </a>
        <button
          onClick={onClose}
          title="Close (Esc)"
          style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}
        >
          ×
        </button>
      </div>

      {filename && (
        <div style={{ position: 'fixed', bottom: 14, left: 0, right: 0, textAlign: 'center', color: 'rgba(255,255,255,0.75)', fontSize: 13, pointerEvents: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 16px' }}>
          {filename}
        </div>
      )}
    </div>,
    document.body,
  );
}
