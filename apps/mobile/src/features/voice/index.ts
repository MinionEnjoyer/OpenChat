/**
 * Voice feature — public surface (FR-VOX-001: connection layer).
 *
 * ── EXTENSION CONTRACT (for FR-VOX-002/003/005/006/007 agents) ──
 *
 * This module exposes the voice connection foundation. The following agents
 * should build on these exports rather than reinventing the connection layer:
 *
 *   FR-VOX-002 (tiles + speaking indicators):
 *     - Import `useVoiceConnection` for the active room and participant roster.
 *     - Use `voiceStore.room` to access livekit-client Room for
 *       ActiveSpeakersChanged and audio-level events.
 *     - Add a `VoiceTile` component in features/voice/ alongside this module.
 *
 *   FR-VOX-003 (mute/deafen controls):
 *     - Import `useVoiceConnection` / `useVoiceStore`.
 *     - Call `room.localParticipant.setMicrophoneEnabled()` etc.
 *     - Add control components in features/voice/; do not change the store
 *       schema without coordination.
 *
 *   FR-VOX-005 (DM calls):
 *     - Import `useVoiceConnection` and the `VoiceJoinResponse` type.
 *     - Listen for `CALL_RING` gateway events (already published by backend).
 *     - Build incoming-call UI; reuse `join()` with a DM channelId.
 *
 *   FR-VOX-006 (video):
 *     - Import `useVoiceConnection`.
 *     - Call `room.localParticipant.setCameraEnabled()` etc.
 *     - Add video tile components; extend VoicePill with video controls.
 *
 *   FR-VOX-007 (screenshare viewing):
 *     - Import `useVoiceConnection`.
 *     - Subscribe to screen share tracks from `room.remoteParticipants`.
 *     - No changes needed to the store or connection layer.
 *
 * ── Module exports ──
 */

export { useVoiceConnection, type VoiceConnectionAPI } from './useVoiceConnection';
export { useVoiceStore, injectVoiceService, getVoiceService, type VoiceConnectionState, type VoiceState } from './VoiceStore';
export { VoiceService } from './VoiceService';
export { VoicePill } from './VoicePill';
export { useScreenShare, type ScreenShareTrack, type UseScreenShareResult } from './useScreenShare';
export { ScreenShareView } from './ScreenShareView';
