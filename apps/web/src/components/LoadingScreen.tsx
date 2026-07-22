/** Full-screen connecting state: spinner while loading, or an error with retry
 *  (and, on desktop, a "sign in again" that returns to the setup screen). */
export function LoadingScreen({ error, onRetry, onReconfigure }: {
  error: string | null;
  onRetry: () => void;
  onReconfigure?: () => void;
}) {
  return (
    <div style={{ height: '100%', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, background: 'var(--bg)', color: 'var(--text)' }}>
      {!error ? (
        <>
          <div className="oc-spinner" />
          <div style={{ color: 'var(--muted)', fontSize: 14 }}>Connecting…</div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 16, color: 'var(--text-strong)', fontWeight: 700 }}>Couldn’t reach the server</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', maxWidth: 340, textAlign: 'center' }}>{error}</div>
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button onClick={onRetry}
              style={{ padding: '9px 18px', borderRadius: 7, border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', cursor: 'pointer', fontWeight: 600 }}>Retry</button>
            {onReconfigure && (
              <button onClick={onReconfigure}
                style={{ padding: '9px 18px', borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', cursor: 'pointer', fontWeight: 600 }}>Sign in again</button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
