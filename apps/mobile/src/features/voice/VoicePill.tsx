/**
 * VoicePill — ongoing-call pill (FR-VOX-001, FR-VOX-006).
 *
 * Rendered when the user is connected to a voice channel. Shows a small,
 * persistent banner at the bottom of the screen with the channel name
 * (or placeholder), camera toggle, and a disconnect button.
 * Navigation-safe: uses the voice store directly, so it survives screen
 * transitions.
 *
 * @satisfies FR-VOX-001
 * @satisfies FR-VOX-006
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useVoiceConnection } from './useVoiceConnection';
import { palette, spacing, typography } from '../../ui/tokens';
import { strings } from '../../ui/strings';

export function VoicePill(): React.JSX.Element | null {
  const {
    connectionState,
    cameraEnabled,
    leave,
    toggleCamera,
    flipCamera,
  } = useVoiceConnection();

  if (connectionState !== 'connected' && connectionState !== 'joining') {
    return null;
  }

  const isConnected = connectionState === 'connected';

  const handleToggleCamera = () => { void toggleCamera(); };
  const handleFlipCamera = () => { void flipCamera(); };

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

      <View style={styles.controls}>
        {/* flip camera button — only visible when camera is active */}
        {cameraEnabled && (
          <Pressable
            onPress={handleFlipCamera}
            style={({ pressed }) => [styles.ctrlBtn, pressed && styles.ctrlBtnPressed]}
            accessibilityLabel={strings.voice.flipCameraA11y}
            testID="voice-pill-flip-camera"
          >
            <Text style={styles.ctrlBtnText}>{strings.voice.flipCamera}</Text>
          </Pressable>
        )}

        {/* camera toggle button */}
        <Pressable
          onPress={handleToggleCamera}
          style={({ pressed }) => [styles.ctrlBtn, pressed && styles.ctrlBtnPressed]}
          accessibilityLabel={cameraEnabled ? strings.voice.cameraOffA11y : strings.voice.cameraOnA11y}
          testID="voice-pill-toggle-camera"
        >
          <Text style={styles.ctrlBtnText}>
            {cameraEnabled ? strings.voice.cameraOff : strings.voice.cameraOn}
          </Text>
        </Pressable>

        {/* disconnect button */}
        <Pressable
          onPress={() => { void leave(); }}
          style={({ pressed }) => [styles.leaveBtn, pressed && styles.leaveBtnPressed]}
          accessibilityLabel={strings.voice.pillLeaveA11y}
          testID="voice-pill-leave"
        >
          <Text style={styles.leaveText}>{strings.voice.pillLeave}</Text>
        </Pressable>
      </View>
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
    minWidth: 0,
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
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  ctrlBtn: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: spacing.xs ?? 6,
    paddingVertical: 4,
    borderRadius: 4,
  },
  ctrlBtnPressed: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  ctrlBtnText: {
    color: palette.text,
    fontSize: typography.caption.fontSize,
    fontWeight: '600',
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
