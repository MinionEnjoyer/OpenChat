import { useRef } from 'react';

/**
 * Presentational audio waveform: bars scaled by `peaks` (0..1), filled up to `progress`
 * (0..1). If `onSeek` is given, clicking/dragging reports the target fraction.
 */
export function Waveform({
  peaks,
  progress,
  onSeek,
  height = 28,
}: {
  peaks: number[];
  progress: number;
  onSeek?: (fraction: number) => void;
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const seek = (clientX: number) => {
    if (!onSeek || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    onSeek(Math.max(0, Math.min(1, (clientX - r.left) / r.width)));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!onSeek) return;
    seek(e.clientX);
    const move = (ev: PointerEvent) => seek(ev.clientX);
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div
      ref={ref}
      onPointerDown={onPointerDown}
      style={{ cursor: onSeek ? 'pointer' : 'default', height, display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}
    >
      {peaks.map((p, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            height: `${Math.max(8, p * 100)}%`,
            borderRadius: 1,
            background: i / peaks.length <= progress ? 'var(--accent)' : 'var(--border)',
          }}
        />
      ))}
    </div>
  );
}
