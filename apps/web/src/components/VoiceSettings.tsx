import { useEffect, useRef, useState } from 'react';
import { getAudioPrefs, type AudioControls, type InputMode, type PttKeybind } from '../lib/audioPrefs';
import { keybindFromEvent } from '../lib/ptt';
import { ToggleSwitch } from './ToggleSwitch';
import { ScreenQualityControls } from './ScreenQualityControls';

export type { AudioControls };

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
  const [mode, setMode] = useState<InputMode>(initial.inputMode);
  const [keybind, setKeybind] = useState<PttKeybind | null>(initial.pttKeybind);
  const [capturing, setCapturing] = useState(false);
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
  function onMode(m: InputMode) { setMode(m); audio.setInputMode(m); }

  // Capture the next real keypress as the PTT keybind (Esc cancels; bare modifiers ignored).
  useEffect(() => {
    if (!capturing) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'Escape') { setCapturing(false); return; }
      const kb = keybindFromEvent(e);
      if (!kb) return;
      setKeybind(kb); audio.setPttKeybind(kb); setCapturing(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [capturing, audio]);

  const modeBtn = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: '8px 10px', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13,
    background: 'var(--input-bg)', color: 'var(--text)',
    border: active ? '2px solid var(--accent)' : '2px solid var(--border)',
  });

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

      {/* Input mode: open mic (voice activity) vs push-to-talk */}
      <label style={{ fontSize: 13, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>Input Mode</label>
      <div style={{ display: 'flex', gap: 8, marginBottom: mode === 'ptt' ? 10 : 16 }}>
        <button style={modeBtn(mode === 'vad')} onClick={() => onMode('vad')}>🎙 Voice Activity</button>
        <button style={modeBtn(mode === 'ptt')} onClick={() => onMode('ptt')}>⌨️ Push to Talk</button>
      </div>
      {mode === 'ptt' && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={() => setCapturing((c) => !c)}
              style={{
                flex: 1, padding: '8px 12px', borderRadius: 4, cursor: 'pointer', fontWeight: 600, fontSize: 13,
                border: '1px solid var(--border)',
                background: capturing ? 'var(--accent)' : 'var(--input-bg)',
                color: capturing ? 'var(--accent-text)' : 'var(--text)',
              }}
            >
              {capturing ? 'Press a key… (Esc to cancel)' : keybind ? `Keybind: ${keybind.label}` : 'Set keybind'}
            </button>
            {keybind && !capturing && (
              <button
                onClick={() => { setKeybind(null); audio.setPttKeybind(null); }}
                style={{ padding: '8px 12px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--muted)', cursor: 'pointer', fontSize: 13 }}
              >
                Clear
              </button>
            )}
          </div>
          <p style={{ margin: '6px 0 0', fontSize: 12, color: keybind ? 'var(--muted)' : 'var(--danger)' }}>
            {keybind
              ? 'Your mic stays muted until you hold this key. On the desktop app it works even when OpenChat is unfocused.'
              : 'Set a key — your mic stays muted until one is assigned.'}
          </p>
        </div>
      )}

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
      <div style={{ fontSize: 13, color: 'var(--muted)', margin: '16px 0 8px', fontWeight: 600 }}>Screen Share</div>
      <ScreenQualityControls audio={audio} />

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
