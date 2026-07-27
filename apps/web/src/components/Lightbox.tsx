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

  // The media is cross-origin (Share), so a plain <a download> is ignored and would just
  // navigate the webview to the raw file (trapping a frameless window). Instead fetch it as
  // a blob and save it (web), or hand the URL to the OS browser (desktop).
  async function download(e: React.MouseEvent) {
    e.stopPropagation();
    const t = (window as any).__TAURI__;
    if (t?.core?.invoke) {
      t.core.invoke('open_external', { url: src }).catch(() => {});
      return;
    }
    try {
      const res = await fetch(src);
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = filename || 'download';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objUrl), 4000);
    } catch {
      window.open(src, '_blank', 'noopener');
    }
  }

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
        // Clicking the image also closes (in addition to the backdrop, ✕, and Esc) so the
        // viewer is never a trap.
        <img
          src={src}
          alt={filename}
          onClick={onClose}
          style={{ maxWidth: '95vw', maxHeight: '92vh', objectFit: 'contain', borderRadius: 6, cursor: 'zoom-out' }}
        />
      )}

      <div style={{ position: 'fixed', top: 14, right: 14, display: 'flex', gap: 8 }}>
        <button
          onClick={download}
          title="Download"
          style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 17, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          ⬇
        </button>
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
