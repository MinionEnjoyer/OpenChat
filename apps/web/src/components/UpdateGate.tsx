import { useEffect, useState } from 'react';

/**
 * Shown on desktop launch before the app loads: checks for an update, and if one is
 * available downloads it (with progress) and relaunches into the new version. If the
 * app is current, an update errors, or the check stalls (15s), it proceeds to the app.
 */
export function UpdateGate({ onDone }: { onDone: () => void }) {
  const [label, setLabel] = useState('Checking for updates…');
  const [pct, setPct] = useState<number | null>(null);

  useEffect(() => {
    const t = (window as any).__TAURI__;
    if (!t?.core?.invoke) { onDone(); return; }
    let finished = false;
    const finish = () => { if (!finished) { finished = true; onDone(); } };
    const unsubs: Array<() => void> = [];
    const timer = window.setTimeout(finish, 15000); // never hang the app on a stuck check

    t.event?.listen?.('update://status', (e: any) => {
      setLabel(e?.payload === 'installing' ? 'Installing update…' : 'Downloading update…');
    }).then((u: () => void) => unsubs.push(u)).catch(() => {});
    t.event?.listen?.('update://progress', (e: any) => {
      const d = e?.payload?.downloaded, tot = e?.payload?.total;
      if (typeof d === 'number' && typeof tot === 'number' && tot > 0) setPct(Math.min(100, Math.round((d / tot) * 100)));
    }).then((u: () => void) => unsubs.push(u)).catch(() => {});

    // Resolves false = already current; if it updates, the process relaunches and this
    // never resolves; errors → proceed anyway.
    t.core.invoke('run_update')
      .then(() => { window.clearTimeout(timer); finish(); })
      .catch(() => { window.clearTimeout(timer); finish(); });

    return () => { window.clearTimeout(timer); unsubs.forEach((u) => u && u()); };
  }, [onDone]);

  return (
    <div style={{ height: '100%', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, background: 'var(--bg)', color: 'var(--text)' }}>
      <div className="oc-spinner" />
      <div style={{ color: 'var(--muted)', fontSize: 14 }}>{label}</div>
      {pct !== null && (
        <div style={{ width: 220, height: 6, borderRadius: 3, background: 'var(--input-bg)', overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)', transition: 'width .15s' }} />
        </div>
      )}
    </div>
  );
}
