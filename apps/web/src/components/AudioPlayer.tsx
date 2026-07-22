import { useEffect, useRef, useState } from 'react';

const BARS = 64;
const MAX_WAVEFORM_BYTES = 25 * 1024 * 1024; // don't decode huge files just to draw a waveform
// Cache computed peaks per source so re-renders / re-mounts don't refetch + re-decode.
const peaksCache = new Map<string, number[]>();

function fmt(s: number): string {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

/** Downsample a decoded buffer to BARS normalized peak heights (0..1). */
function computePeaks(buf: AudioBuffer): number[] {
  const data = buf.getChannelData(0);
  const block = Math.floor(data.length / BARS) || 1;
  const peaks: number[] = [];
  let max = 0;
  for (let i = 0; i < BARS; i++) {
    let peak = 0;
    const start = i * block;
    for (let j = 0; j < block && start + j < data.length; j++) {
      const v = Math.abs(data[start + j]);
      if (v > peak) peak = v;
    }
    peaks.push(peak);
    if (peak > max) max = peak;
  }
  return max > 0 ? peaks.map((p) => p / max) : peaks;
}

/**
 * Inline audio player: play/pause, a waveform (best-effort) or progress track you can
 * click/drag to scrub, elapsed/total time, and mute. Works for any audio the browser can
 * play; scrubbing relies on the /raw endpoint's HTTP Range support.
 */
export function AudioPlayer({ src, filename }: { src: string; filename: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [dur, setDur] = useState(0);
  const [cur, setCur] = useState(0);
  const [muted, setMuted] = useState(false);
  const [peaks, setPeaks] = useState<number[] | null>(() => peaksCache.get(src) ?? null);

  // Best-effort waveform: HEAD to check size, then fetch + decode. Failures (CORS, size,
  // unsupported codec) fall back to a plain progress track — playback is unaffected.
  useEffect(() => {
    if (peaksCache.has(src)) { setPeaks(peaksCache.get(src)!); return; }
    let cancelled = false;
    (async () => {
      try {
        const head = await fetch(src, { method: 'HEAD' });
        const len = Number(head.headers.get('content-length') || '0');
        if (len && len > MAX_WAVEFORM_BYTES) return;
        const res = await fetch(src);
        const arr = await res.arrayBuffer();
        const Ctx = window.AudioContext || (window as any).webkitAudioContext;
        if (!Ctx) return;
        const ctx = new Ctx();
        const buf = await ctx.decodeAudioData(arr);
        ctx.close().catch(() => {});
        if (cancelled) return;
        const p = computePeaks(buf);
        peaksCache.set(src, p);
        setPeaks(p);
      } catch { /* keep the plain progress track */ }
    })();
    return () => { cancelled = true; };
  }, [src]);

  const frac = dur > 0 ? Math.min(1, cur / dur) : 0;

  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => {});
    else a.pause();
  }

  function seekToClientX(clientX: number) {
    const el = trackRef.current;
    const a = audioRef.current;
    if (!el || !a || !dur) return;
    const rect = el.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    a.currentTime = f * dur;
    setCur(a.currentTime);
  }

  function onPointerDown(e: React.PointerEvent) {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    seekToClientX(e.clientX);
    const move = (ev: PointerEvent) => seekToClientX(ev.clientX);
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--panel-dark)', maxWidth: 420, width: '100%' }}>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
        onTimeUpdate={(e) => setCur(e.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />

      <button
        onClick={toggle}
        title={playing ? 'Pause' : 'Play'}
        style={{ flexShrink: 0, width: 36, height: 36, borderRadius: '50%', border: 'none', cursor: 'pointer', background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 15, lineHeight: 1 }}
      >
        {playing ? '⏸' : '▶'}
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 4 }} title={filename}>
          {filename}
        </div>

        {/* Scrub track: waveform if decoded, else a plain progress bar. */}
        <div
          ref={trackRef}
          onPointerDown={onPointerDown}
          style={{ cursor: 'pointer', height: 28, display: 'flex', alignItems: 'center' }}
        >
          {peaks ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%', height: '100%' }}>
              {peaks.map((p, i) => (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    height: `${Math.max(8, p * 100)}%`,
                    borderRadius: 1,
                    background: i / BARS <= frac ? 'var(--accent)' : 'var(--border)',
                  }}
                />
              ))}
            </div>
          ) : (
            <div style={{ width: '100%', height: 6, borderRadius: 3, background: 'var(--input-bg)', overflow: 'hidden' }}>
              <div style={{ width: `${frac * 100}%`, height: '100%', background: 'var(--accent)' }} />
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
          <span>{fmt(cur)}</span>
          <span>{fmt(dur)}</span>
        </div>
      </div>

      <button
        onClick={() => { const a = audioRef.current; if (a) { a.muted = !a.muted; setMuted(a.muted); } }}
        title={muted ? 'Unmute' : 'Mute'}
        style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--muted)' }}
      >
        {muted ? '🔇' : '🔊'}
      </button>
    </div>
  );
}
