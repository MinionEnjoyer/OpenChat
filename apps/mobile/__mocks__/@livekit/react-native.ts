/**
 * Jest mock for @livekit/react-native.
 *
 * Provides stub implementations for AudioSession static methods so that
 * unit tests importing voice features don't load the native WebRTC module.
 */
export const AudioSession = {
  configureAudio: jest.fn().mockResolvedValue(undefined),
  startAudioSession: jest.fn().mockResolvedValue(undefined),
  stopAudioSession: jest.fn().mockResolvedValue(undefined),
  selectAudioOutput: jest.fn().mockResolvedValue(undefined),
  getAudioOutputs: jest.fn().mockResolvedValue(['speaker', 'earpiece', 'headset', 'bluetooth']),
  setDefaultRemoteAudioTrackVolume: jest.fn().mockResolvedValue(undefined),
  showAudioRoutePicker: jest.fn().mockResolvedValue(undefined),
  setAppleAudioConfiguration: jest.fn().mockResolvedValue(undefined),
};

export const AndroidAudioTypePresets = {
  communication: {
    manageAudioFocus: true,
    audioMode: 'inCommunication',
    audioFocusMode: 'gain',
    audioStreamType: 'voiceCall',
    audioAttributesUsageType: 'voiceCommunication',
    audioAttributesContentType: 'speech',
  },
  media: {
    manageAudioFocus: true,
    audioMode: 'normal',
    audioFocusMode: 'gain',
    audioStreamType: 'music',
    audioAttributesUsageType: 'media',
    audioAttributesContentType: 'unknown',
  },
};

export function registerGlobals(): void {}
export function setupIOSAudioManagement(): () => void {
  return () => {};
}
