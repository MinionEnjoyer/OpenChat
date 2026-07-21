import { useEffect, useRef, useState } from 'react';
import { getAudioPrefs, type AudioPrefs, type ScreenResolution } from '../lib/audioPrefs';
import { ToggleSwitch } from './ToggleSwitch';

export interface AudioControls {
  getPrefs: () => AudioPrefs;
  setInputDevice: (id: string) => void;
  setOutputDevice: (id: string) => void;
  setOutputVolume: (v: number) => void;
  setMuteSoundboard: (m: boolean) => void;
  setScreenShareBitrate: (mbps: number) => void;
  setScreenShareFps: (fps: number) => void;
  setScreenShareResolution: (res: ScreenResolution) => void;
}

const QUALITY_PRESETS: { name: string; res: ScreenResolution; fps: number; bitrate: number }[] = [
  { name: 'Balanced', res: '720', fps: 30, bitrate: 4 },
  { name: 'High', res: '1080', fps: 30, bitrate: 8 },
  { name: 'Ultra', res: '1440', fps: 60, bitrate: 16 },
];

/**
 * Voice call audio settings: microphone + speaker device selection, output
 * volume, and a live mic test meter. Changes apply immediately to any active
 * call and persist to localStorage for future calls.
 */
export function VoiceSettings({ audio, label, input }: {
  audio: AudioControls;
  label: React.CSSProperties;
  input: React.CSSProperties;
}) {
  const initial = getAudioPrefs();
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([]);
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]);
  const [inputId, setInputId] = useState(initial.inputDeviceId || '');
  const [outputId, setOutputId] = useState(initial.outputDeviceId || '');
  const [volume, setVolume] = useState(initial.outputVolume);
  const [muteFx, setMuteFx] = useState(initial.muteSoundboard);
  const [bitrate, setBitrate] = useState(initial.screenShareBitrate);
  const [fps, setFps] = useState(initial.screenShareFps);
  const [resolution, setResolution] = useState<ScreenResolution>(initial.screenShareResolution);
  const [permError, setPermError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [level, setLevel] = useState(0);
  const supportsSink = typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;

  // Enumerate devices (labels only populate after mic permission is granted).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true });
        s.getTracks().forEach((t) => t.stop());
      } catch {
        setPermError('Microphone access is blocked — allow it to choose a device.');
      }
      try {
        const devs = await navigator.mediaDevices.enumerateDevices();
        if (cancelled) return;
        setInputs(devs.filter((d) => d.kind === 'audioinput'));
        setOutputs(devs.filter((d) => d.kind === 'audiooutput'));
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // Live input-level meter while the user is testing their mic.
  useEffect(() => {
    if (!testing) { setLevel(0); return; }
    let raf = 0;
    let ctx: AudioContext | null = null;
    let stream: MediaStream | null = null;
    let stopped = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: inputId ? { deviceId: { exact: inputId } } : true,
        });
        if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
        ctx = new AudioContext();
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        src.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          analyser.getByteTimeDomainData(data);
          let peak = 0;
          for (let i = 0; i < data.length; i++) {
            const v = Math.abs(data[i] - 128) / 128;
            if (v > peak) peak = v;
          }
          setLevel((prev) => Math.max(peak, prev * 0.85)); // smooth decay
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        setPermError('Could not open the microphone for testing.');
        setTesting(false);
      }
    })();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      if (ctx) ctx.close().catch(() => {});
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [testing, inputId]);

  function onInput(id: string) { setInputId(id); audio.setInputDevice(id); }
  function onOutput(id: string) { setOutputId(id); audio.setOutputDevice(id); }
  function onVolume(v: number) { setVolume(v); audio.setOutputVolume(v); }
  function onMuteFx(m: boolean) { setMuteFx(m); audio.setMuteSoundboard(m); }
  function onBitrate(v: number) { setBitrate(v); audio.setScreenShareBitrate(v); }
  function onFps(v: number) { setFps(v); audio.setScreenShareFps(v); }
  function onResolution(v: ScreenResolution) { setResolution(v); audio.setScreenShareResolution(v); }
  function applyPreset(p: { res: ScreenResolution; fps: number; bitrate: number }) {
    onResolution(p.res); onFps(p.fps); onBitrate(p.bitrate);
  }
  const activePreset = QUALITY_PRESETS.find((p) => p.res === resolution && p.fps === fps && p.bitrate === bitrate)?.name ?? 'Custom';

  const deviceLabel = (d: MediaDeviceInfo, i: number, kind: string) =>
    d.label || `${kind} ${i + 1}`;

  return (
    <div style={{ marginBottom: 24 }}>
      <span style={label}>Voice &amp; Video</span>

      {permError && (
        <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--danger)' }}>{permError}</p>
      )}

      {/* Microphone device */}
      <label style={{ fontSize: 13, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>Microphone</label>
      <select style={{ ...input, marginBottom: 10 }} value={inputId} onChange={(e) => onInput(e.target.value)}>
        <option value="">System Default</option>
        {inputs.map((d, i) => (
          <option key={d.deviceId} value={d.deviceId}>{deviceLabel(d, i, 'Microphone')}</option>
        ))}
      </select>

      {/* Mic test meter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <button
          onClick={() => setTesting((t) => !t)}
          style={{
            padding: '6px 12px', borderRadius: 4, border: '1px solid var(--border)',
            background: testing ? 'var(--danger)' : 'var(--input-bg)',
            color: testing ? '#fff' : 'var(--text)', cursor: 'pointer', fontWeight: 600, fontSize: 13, flexShrink: 0,
          }}
        >
          {testing ? '■ Stop' : '🎤 Test Mic'}
        </button>
        <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--input-bg)', overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${Math.min(100, Math.round(level * 140))}%`,
            background: level > 0.6 ? 'var(--danger)' : 'var(--accent)', transition: 'width .05s linear',
          }} />
        </div>
      </div>

      {/* Speaker device */}
      <label style={{ fontSize: 13, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>Output Device</label>
      {supportsSink ? (
        <select style={{ ...input, marginBottom: 16 }} value={outputId} onChange={(e) => onOutput(e.target.value)}>
          <option value="">System Default</option>
          {outputs.map((d, i) => (
            <option key={d.deviceId} value={d.deviceId}>{deviceLabel(d, i, 'Speaker')}</option>
          ))}
        </select>
      ) : (
        <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--muted)' }}>
          Your browser uses the system default speaker (output selection unsupported).
        </p>
      )}

      {/* Output volume */}
      <label style={{ fontSize: 13, color: 'var(--muted)', display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span>Output Volume</span><span>{volume}%</span>
      </label>
      <input
        type="range" min={0} max={100} value={volume}
        onChange={(e) => onVolume(Number(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--accent)' }}
      />

      {/* Screen share quality */}
      <div style={{ fontSize: 13, color: 'var(--muted)', margin: '16px 0 6px', display: 'flex', justifyContent: 'space-between' }}>
        <span>Screen Share Quality</span><span style={{ color: 'var(--muted-2)' }}>{activePreset}</span>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {QUALITY_PRESETS.map((p) => {
          const active = activePreset === p.name;
          return (
            <button key={p.name} onClick={() => applyPreset(p)}
              style={{ flex: 1, padding: '8px 0', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                border: '1px solid ' + (active ? 'var(--accent)' : 'var(--border)'),
                background: active ? 'var(--accent)' : 'var(--input-bg)', color: active ? 'var(--accent-text)' : 'var(--text)' }}>
              {p.name}
            </button>
          );
        })}
      </div>

      <label style={{ fontSize: 13, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>Resolution</label>
      <select style={{ ...input, marginBottom: 12 }} value={resolution} onChange={(e) => onResolution(e.target.value as ScreenResolution)}>
        <option value="720">720p</option>
        <option value="1080">1080p</option>
        <option value="1440">1440p</option>
        <option value="native">Native (up to 4K)</option>
      </select>

      <label style={{ fontSize: 13, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>Framerate</label>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {[30, 60, 120].map((f) => {
          const active = fps === f;
          return (
            <button key={f} onClick={() => onFps(f)}
              style={{ flex: 1, padding: '7px 0', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                border: '1px solid ' + (active ? 'var(--accent)' : 'var(--border)'),
                background: active ? 'var(--accent)' : 'var(--input-bg)', color: active ? 'var(--accent-text)' : 'var(--text)' }}>
              {f} fps
            </button>
          );
        })}
      </div>

      <label style={{ fontSize: 13, color: 'var(--muted)', display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span>Bitrate</span><span>{bitrate} Mbps</span>
      </label>
      <input
        type="range" min={2} max={50} step={1} value={bitrate}
        onChange={(e) => onBitrate(Number(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--accent)' }}
      />
      <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted-2)' }}>
        Higher is sharper but uses more upload bandwidth. 60/120 fps favour motion (games); 30 fps favours sharp text. 120 fps needs a high-refresh display and browser support, and pairs best with a higher bitrate. Applies to your next screen share.
      </p>

      {/* Soundboard */}
      <div style={{ marginTop: 16 }}>
        <ToggleSwitch
          checked={muteFx}
          onChange={onMuteFx}
          label="Mute soundboard effects"
          hint="Silences soundboard sounds and disables playing them."
        />
      </div>
    </div>
  );
}
