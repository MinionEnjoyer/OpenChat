/**
 * VoiceChannelView — full-screen voice channel view (FR-VOX-002, FR-VOX-006, FR-VOX-007).
 *
 * Rendered when the user is connected to a voice channel and the voice view is
 * foregrounded. Shows participant tiles (VoiceTileGrid), remote camera video
 * (VideoTile), remote screenshare (ScreenShareView), and controls
 * (VoiceControls). Provides a "Show Chat" button to return to the text channel
 * without leaving the call.
 *
 * @satisfies FR-VOX-002, FR-VOX-006, FR-VOX-007
 */
import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVoiceStore } from './VoiceStore';
import { VoiceTileGrid } from './VoiceTileGrid';
import { VoiceControls } from './VoiceControls';
import { ScreenShareView } from './ScreenShareView';
import { VideoTile } from './VideoTile';
import { useProximityScreen } from './useProximityScreen';
import { palette, spacing, typography } from '../../ui/tokens';
import { strings } from '../../ui/strings';

export interface VoiceChannelViewProps {
  /** Display name for the voice channel. */
  channelName: string;
  /** Called when the user taps "Show Chat" to return to the text channel. */
  onShowChat: () => void;
}

/**
 * Renders remote video tiles for participants who are publishing camera.
 * Reads room.remoteParticipants from the VoiceStore and maps each
 * participant with a camera track to a VideoTile.
 */
function RemoteVideoGrid(): React.JSX.Element | null {
  const room = useVoiceStore((s) => s.room);
  const participantsWithCamera = useMemo(() => {
    if (!room?.remoteParticipants) return [];
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Track } = require('livekit-client');
    const result: { participant: unknown; sid: string }[] = [];
    room.remoteParticipants.forEach((p: unknown) => {
      const participant = p as {
        getTrackPublications?: () => { track: unknown; source: string; trackSid: string }[];
        sid?: string;
      };
      const pubs = participant.getTrackPublications?.() ?? [];
      const hasCamera = pubs.some(
        (pub) => pub.source === Track.Source.Camera && pub.track,
      );
      if (hasCamera && participant.sid) {
        result.push({ participant: p, sid: participant.sid });
      }
    });
    return result;
  }, [room]);

  if (participantsWithCamera.length === 0) return null;

  return (
    <View style={styles.videoSection} testID="voice-remote-video">
      <Text style={styles.sectionLabel}>{strings.voice.videoSectionLabel}</Text>
      <View style={styles.videoGrid}>
        {participantsWithCamera.map((p) => (
          <View key={p.sid} style={styles.videoTileWrapper}>
            <VideoTile participant={p.participant} isLocal={false} />
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * Top-level voice channel view.
 *
 * Renders the full voice experience when the user is connected.
 * Returns null when there is no active room — the parent (ShellScreen)
 * guards the render, but this provides a belt-and-suspenders check.
 */
export function VoiceChannelView({
  channelName,
  onShowChat,
}: VoiceChannelViewProps): React.JSX.Element | null {
  const connectionState = useVoiceStore((s) => s.connectionState);
  // Proximity-screen blanking during earpiece calls (Android only).
  useProximityScreen();
  // D3: safe-area bottom inset to avoid the Android gesture nav bar
  // clipping the controls.  Same pattern as ChatPane composer (useSafeAreaInsets).
  const insets = useSafeAreaInsets();

  if (connectionState !== 'connected') return null;

  const heading = `${strings.voice.voiceViewHeading}: ${channelName}`;

  return (
    <View style={styles.container} testID="voice-channel-view">
      {/* Header: channel name + Show Chat */}
      <View style={styles.header}>
        <Text style={styles.heading} numberOfLines={1}>
          {heading}
        </Text>
        <Pressable
          onPress={onShowChat}
          style={({ pressed }) => [
            styles.showChatBtn,
            pressed && styles.showChatBtnPressed,
          ]}
          accessibilityLabel={strings.voice.showChatA11y}
          accessibilityRole="button"
          testID="voice-show-chat"
        >
          <Text style={styles.showChatText}>{strings.voice.showChat}</Text>
        </Pressable>
      </View>

      {/* Scrollable content */}
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Screenshare (FR-VOX-007) */}
        <ScreenShareView />

        {/* Remote camera video (FR-VOX-006) */}
        <RemoteVideoGrid />

        {/* Participant tiles with speaking rings (FR-VOX-002) */}
        <VoiceTileGrid />
      </ScrollView>

      {/* Controls bar (FR-VOX-003): mute / deafen / speaker / disconnect */}
      {/* D3: wrap in safe-area View so controls clear the Android gesture nav bar */}
      <View style={[styles.controlsWrapper, { paddingBottom: insets.bottom }]}>
        <VoiceControls />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: palette.bgElevated,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  heading: {
    color: palette.text,
    fontSize: typography.body.fontSize,
    fontWeight: '600',
    flex: 1,
    marginRight: spacing.sm,
  },
  showChatBtn: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 6,
  },
  showChatBtnPressed: {
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  showChatText: {
    color: palette.text,
    fontSize: typography.caption.fontSize,
    fontWeight: '600',
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.md,
  },
  // D3: controls wrapper — safe-area bottom inset applied inline.
  // VoiceControls supplies its own background; wrapper only adds safe-area padding.
  controlsWrapper: {},
  videoSection: {
    paddingHorizontal: spacing.sm,
    marginTop: spacing.sm,
  },
  sectionLabel: {
    color: palette.textMuted,
    fontSize: typography.caption.fontSize,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  videoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  videoTileWrapper: {
    width: '47%',
    aspectRatio: 4 / 3,
  },
});
