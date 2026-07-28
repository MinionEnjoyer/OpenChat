/**
 * VideoTile — renders a participant's camera video track (FR-VOX-006).
 *
 * Accepts a livekit-client Participant and renders their camera track using
 * the @livekit/react-native VideoTrack component. Handles both local and
 * remote participants; renders nothing when no camera track is published.
 *
 * LiveKit imports are deferred to require() so that Jest suites not testing
 * voice/video can import this module without loading native WebRTC modules.
 *
 * @satisfies FR-VOX-006
 */
import React, { useMemo } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import type { ViewStyle } from 'react-native';
import { palette, spacing, typography } from '../../ui/tokens';
import { strings } from '../../ui/strings';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Participant = any; // livekit-client Participant

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TrackRef = any; // TrackReference from @livekit/react-native

export interface VideoTileProps {
  /** The livekit-client Participant whose camera track to render. */
  participant: Participant;
  /** Whether this is the local participant (affects mirroring). */
  isLocal?: boolean;
  /** Optional custom style for the container. */
  style?: ViewStyle;
}

/**
 * Resolve a TrackReference for a participant's camera track.
 * Returns undefined if the participant has no camera track.
 * Exported for unit testing.
 */
export function getCameraTrackRef(participant: Participant): TrackRef | undefined {
  if (!participant) return undefined;

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Track } = require('livekit-client');
  const publications: { track: unknown; source: string; trackSid: string }[] =
    participant.getTrackPublications?.() ?? [];

  const camPub = publications.find(
    (p) => p.source === Track.Source.Camera && p.track,
  );

  if (!camPub) return undefined;

  return {
    participant,
    publication: camPub,
    source: Track.Source.Camera,
  };
}

export function VideoTile({ participant, isLocal = false, style }: VideoTileProps): React.JSX.Element {
  const trackRef = useMemo(() => getCameraTrackRef(participant), [participant]);

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { VideoTrack } = require('@livekit/react-native');

  return (
    <View style={[styles.container, style]} testID={isLocal ? 'video-tile-local' : 'video-tile-remote'}>
      {trackRef ? (
        <VideoTrack
          trackRef={trackRef}
          style={styles.video}
          objectFit="cover"
          mirror={isLocal}
        />
      ) : (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>
            {strings.voice.videoOff}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#1e1e1e',
    aspectRatio: 4 / 3,
  },
  video: {
    flex: 1,
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2a2a2a',
  },
  placeholderText: {
    color: palette.textMuted ?? '#888',
    fontSize: typography.caption.fontSize,
    padding: spacing.sm,
  },
});
