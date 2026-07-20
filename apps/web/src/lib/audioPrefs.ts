// Voice call audio preferences. Device IDs are per-browser, so these live in
// localStorage (not on the server) alongside the output-volume level.

export interface AudioPrefs {
  inputDeviceId: string | null;
  outputDeviceId: string | null;
  outputVolume: number; // 0–100, applied to remote participant audio elements
  muteSoundboard: boolean; // when true, soundboard effects are silenced + playing is disabled
}

const KEY = 'openchat.audioPrefs';
const DEFAULTS: AudioPrefs = { inputDeviceId: null, outputDeviceId: null, outputVolume: 100, muteSoundboard: false };

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
