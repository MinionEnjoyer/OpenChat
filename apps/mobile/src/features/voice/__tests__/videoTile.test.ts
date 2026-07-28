/**
 * VideoTile pure-logic tests — getCameraTrackRef (FR-VOX-006).
 *
 * Tests the track-reference resolution logic without rendering.
 * livekit-client is mocked at the Jest module boundary.
 *
 * @satisfies FR-VOX-006
 */

// Mock livekit-client before the import (jest hoists these, but explicit for clarity)
jest.mock('livekit-client', () => ({
  Track: {
    Source: { Camera: 'camera' },
  },
}));

// eslint-disable-next-line import/first
import { getCameraTrackRef } from '../VideoTile';

describe('getCameraTrackRef', () => {
  describe('FR-VOX-006 camera track resolution', () => {
    it('returns undefined when participant is null', () => {
      expect(getCameraTrackRef(null)).toBeUndefined();
    });

    it('returns undefined when participant is undefined', () => {
      expect(getCameraTrackRef(undefined)).toBeUndefined();
    });

    it('returns undefined when participant has no getTrackPublications', () => {
      expect(getCameraTrackRef({})).toBeUndefined();
    });

    it('returns undefined when participant has empty publications', () => {
      const p = { getTrackPublications: () => [] };
      expect(getCameraTrackRef(p)).toBeUndefined();
    });

    it('returns undefined when no publication has source=camera', () => {
      const p = {
        getTrackPublications: () => [
          { track: {}, source: 'microphone', trackSid: 'mic-1' },
        ],
      };
      expect(getCameraTrackRef(p)).toBeUndefined();
    });

    it('returns a TrackReference when a camera publication exists', () => {
      const p = {
        getTrackPublications: () => [
          { track: {}, source: 'camera', trackSid: 'cam-1' },
        ],
        identity: 'test-user',
      };
      const ref = getCameraTrackRef(p);
      expect(ref).toBeDefined();
      expect(ref.participant).toBe(p);
      expect(ref.publication).toEqual({ track: {}, source: 'camera', trackSid: 'cam-1' });
      expect(ref.source).toBe('camera');
    });

    it('finds camera publication among multiple tracks', () => {
      const p = {
        getTrackPublications: () => [
          { track: {}, source: 'microphone', trackSid: 'mic-1' },
          { track: {}, source: 'camera', trackSid: 'cam-1' },
          { track: {}, source: 'screen_share', trackSid: 'ss-1' },
        ],
      };
      const ref = getCameraTrackRef(p);
      expect(ref).toBeDefined();
      expect(ref.publication.trackSid).toBe('cam-1');
    });

    it('skips camera publications without a track', () => {
      const p = {
        getTrackPublications: () => [
          { track: null, source: 'camera', trackSid: 'cam-1' },
        ],
      };
      expect(getCameraTrackRef(p)).toBeUndefined();
    });

    // PROVE-IT-CAN-FAIL: verify test root
    it('returns undefined for a participant with only screen_share', () => {
      const p = {
        getTrackPublications: () => [
          { track: {}, source: 'screen_share', trackSid: 'ss-1' },
        ],
      };
      expect(getCameraTrackRef(p)).toBeUndefined();
    });
  });
});
