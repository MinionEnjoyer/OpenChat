import type { ReactNode } from 'react';

/** Floating panel anchored under the channel header (pins, search, etc.). */
export function HeaderPanel({ title, onClose, children }: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div style={{ position: 'fixed', top: 52, right: 16, width: 340, maxHeight: 440, overflowY: 'auto', zIndex: 60,
      background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.45)' }}>
      <div style={{ padding: '11px 14px', borderBottom: '1px solid var(--border)', fontWeight: 700, color: 'var(--text-strong)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: 'var(--panel)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{title}</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 18 }}>×</button>
      </div>
      {children}
    </div>
  );
}
