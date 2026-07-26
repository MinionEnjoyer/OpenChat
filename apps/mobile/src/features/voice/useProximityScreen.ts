/**
 * useProximityScreen — proximity-sensor screen blanking during voice calls (Android).
 *
 * When the user is connected to a voice channel and the audio route is earpiece
 * (isSpeakerOn === false), this hook acquires Android's
 * PROXIMITY_SCREEN_OFF_WAKE_LOCK, which blanks the screen and suppresses touch
 * when the proximity sensor detects the device near the user's face.
 *
 * On speakerphone, disconnect, or unmount, the wake lock is released.
 *
 * No-op on iOS and in test environments.
 */

import { useEffect } from 'react';
import { useVoiceStore } from './VoiceStore';

type ProximityAPI = {
  acquireProximityScreenOff: () => void;
  releaseProximityScreenOff: () => void;
};

let cachedAPI: ProximityAPI | null = null;

function getProximityAPI(): ProximityAPI {
  if (cachedAPI) return cachedAPI;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../../../../modules/expo-proximity-screen');
    cachedAPI = {
      acquireProximityScreenOff: mod.acquireProximityScreenOff,
      releaseProximityScreenOff: mod.releaseProximityScreenOff,
    };
  } catch {
    // Module not linked yet (e.g. in test, prebuild not run, or non-Android).
    cachedAPI = {
      acquireProximityScreenOff: () => {},
      releaseProximityScreenOff: () => {},
    };
  }
  return cachedAPI;
}

/**
 * Injectable proximity API for testing. Call with `null` to restore defaults.
 */
export function injectProximityAPI(api: ProximityAPI | null): void {
  cachedAPI = api;
}

/**
 * Manages the proximity-screen-off wake lock based on voice call state.
 *
 * Guards:
 * - Only acquires when connected AND in earpiece mode (!isSpeakerOn).
 * - Releases on disconnect, switching to speaker, or unmount.
 * - Handles rapid toggles: acquire is idempotent (native guards re-acquire).
 */
export function useProximityScreen(): void {
  const connectionState = useVoiceStore((s) => s.connectionState);
  const isSpeakerOn = useVoiceStore((s) => s.isSpeakerOn);

  useEffect(() => {
    const shouldBlank = connectionState === 'connected' && !isSpeakerOn;
    const api = getProximityAPI();

    if (shouldBlank) {
      api.acquireProximityScreenOff();
    }

    // Cleanup on dependency change OR unmount — releases the wake lock
    // whenever we leave earpiece mode, disconnect, or the component unmounts.
    return () => {
      api.releaseProximityScreenOff();
    };
  }, [connectionState, isSpeakerOn]);
}
