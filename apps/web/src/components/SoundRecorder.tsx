import { useEffect, useRef, useState } from 'react';
import { getAudioPrefs } from '../lib/audioPrefs';
import { analyzeWaveform } from '../lib/share';
import { AudioPlayer } from './AudioPlayer';

// Pick a MediaRecorder MIME the browser supports, mapped to a base MIME + extension that
// OpenShare accepts. OpenShare matches the content-type exactly, so we strip the ";codecs="
// suffix when tagging the uploaded File.
const CANDIDATES: { rec: string; mime: string; ext: string }[] = [
  { rec: 'audio/webm;codecs=opus', mime: 'audio/webm', ext: 'webm' },
  { rec: 'audio/webm', mime: 'audio/webm', ext: 'webm' },
  { rec: 'audio/mp4', mime: 'audio/mp4', ext: 'm4a' },
  { rec: 'audio/ogg;codecs=opus', mime: 'audio/ogg', ext: 'ogg' },
  { rec: 'audio/ogg', mime: 'audio/ogg', ext: 'ogg' },
];

function pickFormat(): { rec: string | undefined; mime: string; ext: string } {
  const canCheck = typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function';
  for (const c of CANDIDATES) {
    if (!canCheck || MediaRecorder.isTypeSupported(c.rec)) return c;
  }
  return { rec: undefined, mime: 'audio/webm', ext: 'webm' }; // let the browser choose its default
}

const MAX_MS = 5 * 60 * 1000; // 5-minute cap keeps clips sane

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const dbToLinear = (db: number): number => Math.pow(10, db / 20);

/** Encode an AudioBuffer to a 16-bit PCM WAV Blob, applying a linear gain (clamped). */
function encodeWav(buffer: AudioBuffer, gain: number): Blob {
  const numCh = buffer.numberOfChannels;
  const len = buffer.length;
  const rate = buffer.sampleRate;
  const blockAlign = numCh * 2;
  const dataSize = len * blockAlign;
  const ab = new ArrayBuffer(44 + dataSize);
  const view = new DataView(ab);
  const writeStr = (off: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  writeStr(0, 'RIFF'); view.setUint32(4, 36 + dataSize, true); writeStr(8, 'WAVE');
  writeStr(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, numCh, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * blockAlign, true); view.setUint16(32, blockAlign, true); view.setUint16(34, 16, true);
  writeStr(36, 'data'); view.setUint32(40, dataSize, true);
  const chans: Float32Array[] = [];
  for (let c = 0; c < numCh; c++) chans.push(buffer.getChannelData(c));
  let off = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < numCh; c++) {
      let s = chans[c][i] * gain;
      s = Math.max(-1, Math.min(1, s));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      off += 2;
    }
  }
  return new Blob([ab], { type: 'audio/wav' });
}

/**
 * Record a short mic clip and hand it back as a File (posted like any other attachment).
 * Records → preview (with re-record) → Post.
 */
export function SoundRecorder({ shareBaseUrl, onRecorded, onClose }: { shareBaseUrl: string; onRecorded: (file: File) => void; onClose: () => void }) {
  const [phase, setPhase] = useState<'idle' | 'recording' | 'review'>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [gainDb, setGainDb] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewPeaks, setPreviewPeaks] = useState<number[] | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const fmtRef = useRef(pickFormat());
  const blobRef = useRef<Blob | null>(null);
  const startedAtRef = useRef(0);
  const rafRef = useRef(0);
  const ctxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<number | undefined>(undefined);

  const stopStream = () => {
    cancelAnimationFrame(rafRef.current);
    if (timerRef.current) window.clearInterval(timerRef.current);
    ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  // Tear everything down on unmount.
  useEffect(() => () => {
    stopStream();
    try { recorderRef.current?.stop(); } catch { /* ignore */ }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  async function start() {
    setError(null);
    const prefs = getAudioPrefs();
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: prefs.inputDeviceId ? { deviceId: { exact: prefs.inputDeviceId } } : true,
      });
    } catch {
      setError('Microphone access is blocked — allow it to record.');
      return;
    }
    streamRef.current = stream;
    chunksRef.current = [];
    const { rec } = fmtRef.current;
    let recorder: MediaRecorder;
    try {
      recorder = rec ? new MediaRecorder(stream, { mimeType: rec }) : new MediaRecorder(stream);
    } catch {
      recorder = new MediaRecorder(stream);
    }
    recorderRef.current = recorder;
    recorder.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: fmtRef.current.mime });
      blobRef.current = blob;
      const urlOld = previewUrl;
      const nextUrl = URL.createObjectURL(blob);
      setPreviewUrl(nextUrl);
      if (urlOld) URL.revokeObjectURL(urlOld);
      setPreviewPeaks(null);
      setPhase('review');
      stopStream();
      // Bake the waveform on the server right away so the preview matches the posted clip.
      const { mime, ext } = fmtRef.current;
      analyzeWaveform(new File([blob], `clip.${ext}`, { type: mime }), shareBaseUrl)
        .then((r) => { if (r) setPreviewPeaks(r.peaks); })
        .catch(() => {});
    };
    recorder.start();
    startedAtRef.current = Date.now();
    setElapsed(0);
    setPhase('recording');

    // Live level meter (visual feedback while recording).
    try {
      const ctx = new AudioContext();
      ctxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let peak = 0;
        for (let i = 0; i < data.length; i++) { const v = Math.abs(data[i] - 128) / 128; if (v > peak) peak = v; }
        setLevel((prev) => Math.max(peak, prev * 0.85));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch { /* meter is optional */ }

    timerRef.current = window.setInterval(() => {
      const ms = Date.now() - startedAtRef.current;
      setElapsed(ms);
      if (ms >= MAX_MS) stop();
    }, 200);
  }

  function stop() {
    if (timerRef.current) window.clearInterval(timerRef.current);
    try { recorderRef.current?.stop(); } catch { /* onstop cleans up */ }
  }

  function reset() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewPeaks(null);
    blobRef.current = null;
    setElapsed(0);
    setLevel(0);
    setPhase('idle');
  }

  async function post() {
    const blob = blobRef.current;
    if (!blob) return;
    let outBlob: Blob = blob;
    let mime = fmtRef.current.mime;
    let ext = fmtRef.current.ext;
    // Bake the dB gain into a WAV when adjusted; 0 dB posts the original (smaller) clip.
    if (gainDb !== 0) {
      try {
        const arr = await blob.arrayBuffer();
        const Ctx = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new Ctx();
        const buf = await ctx.decodeAudioData(arr);
        ctx.close().catch(() => {});
        outBlob = encodeWav(buf, dbToLinear(gainDb));
        mime = 'audio/wav';
        ext = 'wav';
      } catch { /* fall back to the original clip if decode/encode fails */ }
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const file = new File([outBlob], `recording-${stamp}.${ext}`, { type: mime });
    onRecorded(file);
    onClose();
  }

  const btn = (bg: string): React.CSSProperties => ({
    padding: '10px 18px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14,
    background: bg, color: 'var(--accent-text)',
  });

  return (
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}
    >
      <div style={{ background: 'var(--panel)', color: 'var(--text)', borderRadius: 10, width: '100%', maxWidth: 420, padding: 24, boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18, color: 'var(--text-strong)' }}>🎙 Record a sound clip</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 22, cursor: 'pointer' }}>×</button>
        </div>

        {error && <p style={{ color: 'var(--danger)', marginTop: 0 }}>{error}</p>}

        {/* Timer + level */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 26, fontWeight: 700, color: phase === 'recording' ? 'var(--danger)' : 'var(--text-strong)' }}>
            {fmt(elapsed)}
          </span>
          <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--input-bg)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${phase === 'recording' ? Math.min(100, Math.round(level * 140)) : 0}%`, background: level > 0.6 ? 'var(--danger)' : 'var(--accent)', transition: 'width .05s linear' }} />
          </div>
        </div>

        {phase === 'review' && previewUrl && (
          <>
            <div style={{ marginBottom: 14 }}>
              <AudioPlayer src={previewUrl} filename="Recording" peaks={previewPeaks ?? undefined} gainDb={gainDb} />
            </div>
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>
                <span>Level</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{gainDb > 0 ? '+' : ''}{gainDb} dB</span>
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="range" min={-12} max={12} step={1} value={gainDb}
                  onChange={(e) => setGainDb(Number(e.target.value))}
                  style={{ flex: 1, accentColor: 'var(--accent)' }}
                />
                {gainDb !== 0 && (
                  <button onClick={() => setGainDb(0)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 12 }}>Reset</button>
                )}
              </div>
            </div>
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          {phase === 'idle' && <button onClick={start} style={btn('var(--danger)')}>● Record</button>}
          {phase === 'recording' && <button onClick={stop} style={btn('var(--accent)')}>■ Stop</button>}
          {phase === 'review' && (
            <>
              <button onClick={reset} style={{ ...btn('var(--input-bg)'), color: 'var(--text)' }}>Re-record</button>
              <button onClick={post} style={btn('var(--accent)')}>Post</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
