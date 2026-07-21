// Voice call audio preferences. Device IDs are per-browser, so these live in
// localStorage (not on the server) alongside the output-volume level.

export interface AudioPrefs {
  inputDeviceId: string | null;
  outputDeviceId: string | null;
  outputVolume: number; // 0–100, applied to remote participant audio elements
  muteSoundboard: boolean; // when true, soundboard effects are silenced + playing is disabled
  screenShareBitrate: number; // Mbps cap for outgoing screen-share video
  screenShareFps: number; // capture/publish framerate (30 or 60)
  screenShareResolution: ScreenResolution; // capture resolution cap
}

export type ScreenResolution = '720' | '1080' | '1440' | 'native';

/** Live audio/video controls exposed by the voice hook to settings UIs. */
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

const KEY = 'openchat.audioPrefs';
const DEFAULTS: AudioPrefs = {
  inputDeviceId: null, outputDeviceId: null, outputVolume: 100, muteSoundboard: false,
  screenShareBitrate: 12, screenShareFps: 30, screenShareResolution: '1440',
};

export function getAudioPrefs(): AudioPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveAudioPrefs(patch: Partial<AudioPrefs>): AudioPrefs {
  const next = { ...getAudioPrefs(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore quota / private-mode failures */
  }
  return next;
}
