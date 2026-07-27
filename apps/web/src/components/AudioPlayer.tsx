import { useEffect, useRef, useState } from 'react';
import { Waveform } from './Waveform';

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
 * Inline audio player: play/pause, a waveform (server peaks, precomputed peaks, or a
 * best-effort client decode) you can click/drag to scrub, elapsed/total time, and mute.
 * When `gainDb` is provided, playback is routed through a GainNode (used by the recorder
 * preview so a level change is audible). Scrubbing relies on /raw HTTP Range support.
 */
export function AudioPlayer({
  src,
  filename,
  peaksUrl,
  peaks: peaksProp,
  gainDb,
}: {
  src: string;
  filename: string;
  peaksUrl?: string;
  peaks?: number[];
  gainDb?: number;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [dur, setDur] = useState(0);
  const [cur, setCur] = useState(0);
  const [muted, setMuted] = useState(false);
  const [bars, setBars] = useState<number[] | null>(() => peaksProp ?? peaksCache.get(src) ?? null);

  // Optional playback gain graph (recorder preview). Created once; source can only be
  // attached to an element a single time.
  const gainCtxRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  // Waveform source of truth: explicit peaks prop > server peaks > client decode.
  useEffect(() => {
    if (peaksProp) { setBars(peaksProp); return; }
    if (peaksCache.has(src)) { setBars(peaksCache.get(src)!); return; }
    let cancelled = false;
    (async () => {
      if (peaksUrl) {
        try {
          const res = await fetch(peaksUrl);
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data?.peaks) && data.peaks.length) {
              const norm = data.peaks.map((p: number) => Math.max(0, Math.min(1, p / 100)));
              if (cancelled) return;
              peaksCache.set(src, norm);
              setBars(norm);
              if (typeof data.duration === 'number' && data.duration > 0) setDur((d) => d || data.duration);
              return;
            }
          }
        } catch { /* fall through to client decode */ }
      }
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
        setBars(p);
      } catch { /* keep the plain progress track */ }
    })();
    return () => { cancelled = true; };
  }, [src, peaksUrl, peaksProp]);

  // Route playback through a GainNode when a gain is requested.
  useEffect(() => {
    if (gainDb === undefined) return;
    const el = audioRef.current;
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!el || !Ctx) return;
    try {
      if (!gainCtxRef.current) {
        const ctx = new Ctx();
        gainCtxRef.current = ctx;
        const g = ctx.createGain();
        ctx.createMediaElementSource(el).connect(g);
        g.connect(ctx.destination);
        gainNodeRef.current = g;
      }
      if (gainNodeRef.current) gainNodeRef.current.gain.value = Math.pow(10, gainDb / 20);
    } catch { /* gain is optional */ }
  }, [gainDb]);

  useEffect(() => () => { gainCtxRef.current?.close().catch(() => {}); }, []);

  const frac = dur > 0 ? Math.min(1, cur / dur) : 0;

  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    gainCtxRef.current?.resume().catch(() => {});
    if (a.paused) a.play().catch(() => {});
    else a.pause();
  }

  function seekFrac(f: number) {
    const a = audioRef.current;
    if (!a || !dur) return;
    a.currentTime = f * dur;
    setCur(a.currentTime);
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

        {bars ? (
          <Waveform peaks={bars} progress={frac} onSeek={seekFrac} />
        ) : (
          <div
            onPointerDown={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              seekFrac((e.clientX - r.left) / r.width);
            }}
            style={{ cursor: 'pointer', height: 28, display: 'flex', alignItems: 'center' }}
          >
            <div style={{ width: '100%', height: 6, borderRadius: 3, background: 'var(--input-bg)', overflow: 'hidden' }}>
              <div style={{ width: `${frac * 100}%`, height: '100%', background: 'var(--accent)' }} />
            </div>
          </div>
        )}

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
