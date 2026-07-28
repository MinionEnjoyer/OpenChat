import { requireNativeModule } from 'expo-modules-core';

export interface ExpoProximityScreenNative {
  /** Acquire the PROXIMITY_SCREEN_OFF_WAKE_LOCK. Android only. */
  acquire(): void;
  /** Release the PROXIMITY_SCREEN_OFF_WAKE_LOCK. Android only. Idempotent. */
  release(): void;
}

const native = requireNativeModule<ExpoProximityScreenNative>('ExpoProximityScreen');

/** Acquire the PROXIMITY_SCREEN_OFF_WAKE_LOCK. Android only, no-op on other platforms. */
export function acquireProximityScreenOff(): void {
  native.acquire();
}

/** Release the PROXIMITY_SCREEN_OFF_WAKE_LOCK. Android only, no-op on other platforms. */
export function releaseProximityScreenOff(): void {
  native.release();
}
