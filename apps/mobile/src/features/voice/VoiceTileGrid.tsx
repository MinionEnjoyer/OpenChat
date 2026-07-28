/**
 * VoiceTileGrid — participant tile grid for FR-VOX-002.
 *
 * Renders all connected participants as VoiceTile components in a
 * wrapping flex layout. Wires the useVoiceParticipants hook so
 * LiveKit events automatically populate the roster.
 *
 * Only renders when the voice connection is 'connected'.
 *
 * @satisfies FR-VOX-002
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useVoiceStore } from './VoiceStore';
import { useVoiceParticipants } from './useVoiceParticipants';
import { VoiceTile } from './VoiceTile';
import { palette, spacing, typography } from '../../ui/tokens';
import { strings } from '../../ui/strings';

export function VoiceTileGrid(): React.JSX.Element | null {
  const connectionState = useVoiceStore((s) => s.connectionState);
  const participants = useVoiceStore((s) => s.participants);

  // Wire LiveKit events → store
  useVoiceParticipants();

  if (connectionState !== 'connected') return null;

  return (
    <View style={styles.wrapper} testID="voice-tile-grid">
      <Text style={styles.heading}>{strings.voice.tilesHeading}</Text>
      <View style={styles.grid}>
        {participants.length === 0 ? (
          <Text style={styles.empty}>{strings.voice.tilesEmpty}</Text>
        ) : (
          participants.map((p) => (
            <VoiceTile key={p.id} participant={p} />
          ))
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingVertical: spacing.md,
  },
  heading: {
    color: palette.textMuted,
    fontSize: typography.caption.fontSize,
    fontWeight: '600',
    textTransform: 'uppercase',
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    paddingHorizontal: spacing.sm,
  },
  empty: {
    color: palette.textMuted,
    fontSize: typography.caption.fontSize,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
});
