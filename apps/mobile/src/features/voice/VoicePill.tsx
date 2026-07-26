/**
 * VoicePill — ongoing-call pill with mute/deafen/camera/disconnect (FR-VOX-001, FR-VOX-003, FR-VOX-006).
 *
 * Rendered when the user is connected to a voice channel. Shows a small,
 * persistent banner at the bottom of the screen with the connection status,
 * mute/deafen/camera toggle buttons, and a disconnect button. Navigation-safe: uses the
 * voice store directly, so it survives screen transitions.
 *
 * @satisfies FR-VOX-001, FR-VOX-003, FR-VOX-006
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useVoiceConnection } from './useVoiceConnection';
import { palette, spacing, typography } from '../../ui/tokens';
import { strings } from '../../ui/strings';

export function VoicePill(): React.JSX.Element | null {
  const {
    connectionState,
    isMuted,
    isDeafened,
    toggleMute,
    toggleDeafen,
    cameraEnabled,
    toggleCamera,
    flipCamera,
    leave,
  } = useVoiceConnection();

  if (connectionState !== 'connected' && connectionState !== 'joining') {
    return null;
  }

  const isConnected = connectionState === 'connected';

  return (
    <View style={styles.container} testID="voice-pill">
      {/* Status row */}
      <View style={styles.statusRow}>
        <View style={styles.left}>
          <View
            style={[styles.dot, isConnected ? styles.dotConnected : styles.dotConnecting]}
          />
          <Text style={styles.label} numberOfLines={1}>
            {isConnected ? strings.voice.pillConnected : strings.voice.pillConnecting}
          </Text>
          {isMuted && (
            <Text style={styles.badge} testID="voice-pill-muted-badge">{strings.voice.iconMuted}</Text>
          )}
          {isDeafened && (
            <Text style={styles.badge} testID="voice-pill-deafened-badge">{strings.voice.iconDeafened}</Text>
          )}
        </View>
      </View>

      {/* Controls row */}
      {isConnected && (
        <View style={styles.controlsRow} testID="voice-pill-controls">
          {/* Mute */}
          <Pressable
            onPress={toggleMute}
            style={({ pressed }) => [
              styles.ctrlBtn,
              isMuted ? styles.ctrlBtnActive : styles.ctrlBtnInactive,
              pressed && styles.ctrlBtnPressed,
            ]}
            accessibilityLabel={strings.voice.muteA11y}
            accessibilityRole="button"
            testID="voice-pill-mute"
          >
            <Text style={styles.ctrlIcon}>
              {isMuted ? strings.voice.iconMuted : strings.voice.iconUnmuted}
            </Text>
            <Text style={styles.ctrlLabel}>
              {isMuted ? strings.voice.unmute : strings.voice.mute}
            </Text>
          </Pressable>

          {/* Deafen */}
          <Pressable
            onPress={toggleDeafen}
            style={({ pressed }) => [
              styles.ctrlBtn,
              isDeafened ? styles.ctrlBtnActive : styles.ctrlBtnInactive,
              pressed && styles.ctrlBtnPressed,
            ]}
            accessibilityLabel={strings.voice.deafenA11y}
            accessibilityRole="button"
            testID="voice-pill-deafen"
          >
            <Text style={styles.ctrlIcon}>
              {isDeafened ? strings.voice.iconUndeafened : strings.voice.iconMuted}
            </Text>
            <Text style={styles.ctrlLabel}>
              {isDeafened ? strings.voice.undeafen : strings.voice.deafen}
            </Text>
          </Pressable>

          {/* Flip camera — only visible when camera is active (FR-VOX-006) */}
          {cameraEnabled && (
            <Pressable
              onPress={() => { void flipCamera(); }}
              style={({ pressed }) => [
                styles.ctrlBtn,
                styles.ctrlBtnInactive,
                pressed && styles.ctrlBtnPressed,
              ]}
              accessibilityLabel={strings.voice.flipCameraA11y}
              accessibilityRole="button"
              testID="voice-pill-flip-camera"
            >
              
              <Text style={styles.ctrlLabel}>{strings.voice.flipCamera}</Text>
            </Pressable>
          )}

          {/* Camera toggle (FR-VOX-006) */}
          <Pressable
            onPress={() => { void toggleCamera(); }}
            style={({ pressed }) => [
              styles.ctrlBtn,
              cameraEnabled ? styles.ctrlBtnActive : styles.ctrlBtnInactive,
              pressed && styles.ctrlBtnPressed,
            ]}
            accessibilityLabel={cameraEnabled ? strings.voice.cameraOffA11y : strings.voice.cameraOnA11y}
            accessibilityRole="button"
            testID="voice-pill-camera"
          >
            <Text style={styles.ctrlIcon}>
              {cameraEnabled ? '📹' : '📷'}
            </Text>
            <Text style={styles.ctrlLabel}>
              {cameraEnabled ? strings.voice.cameraOff : strings.voice.cameraOn}
            </Text>
          </Pressable>

          {/* Disconnect */}
          <Pressable
            onPress={() => { void leave(); }}
            style={({ pressed }) => [
              styles.ctrlBtn,
              styles.ctrlBtnDanger,
              pressed && styles.ctrlBtnPressed,
            ]}
            accessibilityLabel={strings.voice.disconnectA11y}
            accessibilityRole="button"
            testID="voice-pill-disconnect"
          >
            <Text style={styles.ctrlIcon}>{strings.voice.iconDisconnect}</Text>
            <Text style={[styles.ctrlLabel, styles.ctrlLabelDanger]}>
              {strings.voice.disconnect}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1e6332', // Discord-style green call banner
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  badge: {
    fontSize: 12,
    marginLeft: spacing.xs,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  ctrlBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: 6,
    minWidth: 64,
  },
  ctrlBtnInactive: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  ctrlBtnActive: {
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  ctrlBtnDanger: {
    backgroundColor: 'rgba(220,20,60,0.6)',
  },
  ctrlBtnPressed: {
    opacity: 0.7,
  },
  ctrlIcon: {
    fontSize: 18,
    marginBottom: 2,
  },
  ctrlLabel: {
    color: palette.text,
    fontSize: typography.caption.fontSize,
    fontWeight: '600',
  },
  ctrlLabelDanger: {
    color: '#ff6b6b',
  },
});
