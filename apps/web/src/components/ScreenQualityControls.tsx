import { useState } from 'react';
import type { AudioControls, ScreenResolution } from '../lib/audioPrefs';

const QUALITY_PRESETS: { name: string; res: ScreenResolution; fps: number; bitrate: number }[] = [
  { name: 'Balanced', res: '720', fps: 30, bitrate: 4 },
  { name: 'High', res: '1080', fps: 30, bitrate: 8 },
  { name: 'Ultra', res: '1440', fps: 60, bitrate: 16 },
];

const input: React.CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)',
  background: 'var(--input-bg)', color: 'var(--text)', outline: 'none', fontSize: 14,
};

/** Screen-share capture quality controls (preset + resolution + fps + bitrate).
 *  Shared by the settings modal and the in-player gear panel; persists to prefs. */
export function ScreenQualityControls({ audio, compact }: { audio: AudioControls; compact?: boolean }) {
  const initial = audio.getPrefs();
  const [bitrate, setBitrate] = useState(initial.screenShareBitrate);
  const [fps, setFps] = useState(initial.screenShareFps);
  const [resolution, setResolution] = useState<ScreenResolution>(initial.screenShareResolution);

  const onBitrate = (v: number) => { setBitrate(v); audio.setScreenShareBitrate(v); };
  const onFps = (v: number) => { setFps(v); audio.setScreenShareFps(v); };
  const onResolution = (v: ScreenResolution) => { setResolution(v); audio.setScreenShareResolution(v); };
  const applyPreset = (p: { res: ScreenResolution; fps: number; bitrate: number }) => { onResolution(p.res); onFps(p.fps); onBitrate(p.bitrate); };
  const activePreset = QUALITY_PRESETS.find((p) => p.res === resolution && p.fps === fps && p.bitrate === bitrate)?.name ?? 'Custom';

  const seg = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: '7px 0', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600,
    border: '1px solid ' + (active ? 'var(--accent)' : 'var(--border)'),
    background: active ? 'var(--accent)' : 'var(--input-bg)', color: active ? 'var(--accent-text)' : 'var(--text)',
  });
  const lbl: React.CSSProperties = { fontSize: 13, color: 'var(--muted)', display: 'block', marginBottom: 6 };

  return (
    <div>
      <div style={{ ...lbl, display: 'flex', justifyContent: 'space-between' }}>
        <span>Quality</span><span style={{ color: 'var(--muted-2)' }}>{activePreset}</span>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {QUALITY_PRESETS.map((p) => (
          <button key={p.name} onClick={() => applyPreset(p)} style={seg(activePreset === p.name)}>{p.name}</button>
        ))}
      </div>

      <label style={lbl}>Resolution</label>
      <select style={{ ...input, marginBottom: 12 }} value={resolution} onChange={(e) => onResolution(e.target.value as ScreenResolution)}>
        <option value="720">720p</option>
        <option value="1080">1080p</option>
        <option value="1440">1440p</option>
        <option value="native">Native (up to 4K)</option>
      </select>

      <label style={lbl}>Framerate</label>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {[30, 60, 120].map((f) => <button key={f} onClick={() => onFps(f)} style={seg(fps === f)}>{f} fps</button>)}
      </div>

      <label style={{ ...lbl, display: 'flex', justifyContent: 'space-between' }}>
        <span>Bitrate</span><span>{bitrate} Mbps</span>
      </label>
      <input type="range" min={2} max={50} step={1} value={bitrate}
        onChange={(e) => onBitrate(Number(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--accent)' }} />
      {!compact && (
        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted-2)' }}>
          Higher is sharper but uses more upload bandwidth. 60/120 fps favour motion (games); 30 fps favours sharp text. 120 fps needs a high-refresh display and browser support. Applies to your next screen share.
        </p>
      )}
    </div>
  );
}
