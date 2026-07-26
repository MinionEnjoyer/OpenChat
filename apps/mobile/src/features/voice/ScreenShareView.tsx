/**
 * ScreenShareView — renders remote screen share video tracks with LIVE badge
 * and per-stream show/hide toggle (FR-VOX-007).
 *
 * Uses the @livekit/react-native VideoTrack component for rendering and
 * the useScreenShare hook for track subscription management.
 *
 * @satisfies FR-VOX-007
 */
import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useScreenShare } from './useScreenShare';
import { palette, spacing, typography } from '../../ui/tokens';
import { strings } from '../../ui/strings';

/**
 * Renders a single screen share stream with LIVE badge and toggle.
 * Uses dynamic require for VideoTrack (native module, mocked in Jest).
 */
function ScreenShareTile({
  id,
  participantName,
  trackRef,
  visible,
  onToggle,
}: {
  id: string;
  participantName: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  trackRef: any;
  visible: boolean;
  onToggle: (id: string) => void;
}) {
  // Dynamic require — @livekit/react-native is a native module; Jest mocks it.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { VideoTrack } = require('@livekit/react-native');

  return (
    <View style={styles.tile} testID={`screenshare-tile-${id}`}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.screenIcon}>{strings.screenshare.screenIcon}</Text>
          <Text style={styles.participantName} numberOfLines={1}>
            {participantName}
          </Text>
          <View style={styles.liveBadge} testID={`screenshare-live-${id}`}>
            <Text style={styles.liveBadgeText}>{strings.screenshare.live}</Text>
          </View>
        </View>
        <Pressable
          onPress={() => onToggle(id)}
          style={({ pressed }) => [
            styles.toggleBtn,
            pressed && styles.toggleBtnPressed,
          ]}
          accessibilityLabel={
            visible
              ? strings.screenshare.hideA11y
              : strings.screenshare.showA11y
          }
          testID={`screenshare-toggle-${id}`}
        >
          <Text style={styles.toggleText}>
            {visible ? strings.screenshare.hide : strings.screenshare.show}
          </Text>
        </Pressable>
      </View>

      {/* Video track (hidden when toggled off) */}
      {visible && trackRef && (
        <View style={styles.videoContainer} testID={`screenshare-video-${id}`}>
          <VideoTrack
            trackRef={trackRef}
            style={styles.video}
            objectFit="contain"
          />
        </View>
      )}
    </View>
  );
}

/**
 * Top-level screen share viewer. Renders nothing when there are no
 * active screen share tracks.
 */
export function ScreenShareView(): React.JSX.Element | null {
  const { screens, toggleVisibility } = useScreenShare();

  if (screens.length === 0) return null;

  return (
    <View style={styles.container} testID="screenshare-view">
      {screens.map((s) => (
        <ScreenShareTile
          key={s.id}
          id={s.id}
          participantName={s.participantName}
          trackRef={s.trackRef}
          visible={s.visible}
          onToggle={toggleVisibility}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    rowGap: spacing.sm,
  },
  tile: {
    backgroundColor: '#000',
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: palette.textMuted,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    columnGap: spacing.xs,
  },
  screenIcon: {
    fontSize: 14,
  },
  participantName: {
    color: palette.text,
    fontSize: typography.caption.fontSize,
    fontWeight: '600',
    flexShrink: 1,
  },
  liveBadge: {
    backgroundColor: '#da373c',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  liveBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  toggleBtn: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: 4,
  },
  toggleBtnPressed: {
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  toggleText: {
    color: palette.text,
    fontSize: 12,
    fontWeight: '600',
  },
  videoContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
  },
  video: {
    width: '100%',
    height: '100%',
  },
});
