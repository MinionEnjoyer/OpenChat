/**
 * Soundboard publish seam — LOCAL-ONLY in this implementation.
 *
 * Room-publish is DEFERRED per docs/SOUNDBOARD-RN-SPIKE.md (commit 88e48ca):
 * there is no client-side publish path in React Native. When a native module
 * is built (see §5.2–5.4 of that doc), this is the single place to plug in:
 *
 *   1. Accept a livekit-client Room and the ServerSound.
 *   2. Call room.localParticipant.publishTrack(soundboardTrack, { name: 'soundboard', ... }).
 *   3. This function is already called on every sound tap.
 *
 * DO NOT add room-publishing logic here until the native module exists.
 * Until then, this is intentional no-op — other participants CANNOT hear the sound.
 *
 * @satisfies FR-SOUND-001
 */

import type { ServerSound } from '../../api/schema';
import { logger } from '../../lib/logger';

/**
 * publishSoundToRoom — room-publish seam.
 *
 * Called on every soundboard tap alongside local playback.
 * Currently logs that room-publish is not yet implemented.
 *
 * When room-publish is ready (see docs/SOUNDBOARD-RN-SPIKE.md):
 *   - Accept a `room` parameter (livekit-client Room).
 *   - Call room.localParticipant.publishTrack() with a soundboard track.
 *
 * @param sound - The server sound being played.
 */
export function publishSoundToRoom(sound: ServerSound): void {
  logger.debug(
    `[soundboard] publishSoundToRoom: room-publish NOT YET IMPLEMENTED (sound="${sound.name}" id="${sound.id}") — see docs/SOUNDBOARD-RN-SPIKE.md`,
  );
}
