import { useEffect, useRef, type ReactNode } from 'react';

/** Shared centered panel for channel-level options (pins, search, etc.). */
export function HeaderPanel({ title, onClose, children }: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <>
    <div className="chat-option-backdrop" onMouseDown={onClose} />
    <div ref={panelRef} className="chat-option-dialog" role="dialog" aria-modal="true" style={{ width: 380, maxHeight: 'min(520px, calc(100dvh - 24px))', overflowY: 'auto',
      background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.45)' }}>
      <div style={{ padding: '11px 14px', borderBottom: '1px solid var(--border)', fontWeight: 700, color: 'var(--text-strong)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: 'var(--panel)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{title}</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 18 }}>×</button>
      </div>
      {children}
    </div>
    </>
  );
}
