// Custom window title bar for the Tauri desktop shell. Rendered only when running
// inside Tauri (the web build ignores it). Uses the injected `window.__TAURI__`
// global (withGlobalTauri) so the web bundle needs no Tauri dependency.

export function isTauri(): boolean {
  return typeof (window as any).__TAURI_INTERNALS__ !== 'undefined' || typeof (window as any).__TAURI__ !== 'undefined';
}

export const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform || navigator.userAgent || '');

function currentWindow(): any {
  return (window as any).__TAURI__?.window?.getCurrentWindow?.();
}

const ctrl: React.CSSProperties = {
  width: 46, height: 34, border: 'none', background: 'transparent', color: 'var(--muted)',
  cursor: 'pointer', fontSize: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
};

export function TitleBar() {
  return (
    <div data-tauri-drag-region
      style={{ height: 34, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'var(--panel-dark)', borderBottom: '1px solid var(--border)', userSelect: 'none',
        paddingLeft: isMac ? 76 : 12 }}>
      <span data-tauri-drag-region style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.3, color: 'var(--muted)', pointerEvents: 'none' }}>
        OpenChat
      </span>
      {/* macOS uses its native traffic lights; Windows/Linux get custom controls */}
      {!isMac && (
        <div style={{ display: 'flex' }}>
          <button style={ctrl} title="Minimize" onClick={() => currentWindow()?.minimize()}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>–</button>
          <button style={ctrl} title="Maximize" onClick={() => currentWindow()?.toggleMaximize()}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>▢</button>
          <button style={ctrl} title="Close" onClick={() => currentWindow()?.close()}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--danger)'; e.currentTarget.style.color = '#fff'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--muted)'; }}>✕</button>
        </div>
      )}
    </div>
  );
}
