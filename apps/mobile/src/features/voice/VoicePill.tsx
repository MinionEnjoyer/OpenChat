/**
 * VoicePill — ongoing-call pill (FR-VOX-001).
 *
 * Rendered when the user is connected to a voice channel. Shows a small,
 * persistent banner at the bottom of the screen with the channel name
 * (or placeholder) and a disconnect button. Navigation-safe: uses the
 * voice store directly, so it survives screen transitions.
 *
 * @satisfies FR-VOX-001
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useVoiceConnection } from './useVoiceConnection';
import { palette, spacing, typography } from '../../ui/tokens';
import { strings } from '../../ui/strings';

export function VoicePill(): React.JSX.Element | null {
  const { connectionState, leave } = useVoiceConnection();

  if (connectionState !== 'connected' && connectionState !== 'joining') {
    return null;
  }

  const isConnected = connectionState === 'connected';

  return (
    <View style={styles.container} testID="voice-pill">
      <View style={styles.left}>
        <View
          style={[styles.dot, isConnected ? styles.dotConnected : styles.dotConnecting]}
        />
        <Text style={styles.label} numberOfLines={1}>
          {isConnected ? strings.voice.pillConnected : strings.voice.pillConnecting}
        </Text>
      </View>
      <Pressable
        onPress={() => { void leave(); }}
        style={({ pressed }) => [styles.leaveBtn, pressed && styles.leaveBtnPressed]}
        accessibilityLabel={strings.voice.pillLeaveA11y}
        testID="voice-pill-leave"
      >
        <Text style={styles.leaveText}>{strings.voice.pillLeave}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1e6332', // Discord-style green call banner
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 44,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.sm,
  },
  dotConnected: {
    backgroundColor: '#ffffff',
  },
  dotConnecting: {
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  label: {
    color: palette.text,
    fontSize: typography.caption.fontSize,
    fontWeight: '600',
    flex: 1,
  },
  leaveBtn: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 4,
  },
  leaveBtnPressed: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  leaveText: {
    color: palette.text,
    fontSize: typography.caption.fontSize,
    fontWeight: '600',
  },
});
