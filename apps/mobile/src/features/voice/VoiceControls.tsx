/**
 * VoiceControls — mute, deafen, speaker, disconnect buttons (FR-VOX-003).
 *
 * Renders a row of control buttons that operate on the current voice
 * connection. Designed to be used inside the VoicePill or in a
 * standalone control panel. All operations are safe to call even
 * when no room is connected — the store actions guard against null room.
 *
 * @satisfies FR-VOX-003
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useVoiceConnection } from './useVoiceConnection';
import { palette, spacing, typography } from '../../ui/tokens';
import { strings } from '../../ui/strings';

type MI = React.ComponentProps<typeof MaterialIcons>['name'];

export function VoiceControls(): React.JSX.Element | null {
  const {
    connectionState,
    isMuted,
    isDeafened,
    isSpeakerOn,
    toggleMute,
    toggleDeafen,
    toggleSpeaker,
    leave,
  } = useVoiceConnection();

  if (connectionState !== 'connected') return null;

  return (
    <View style={styles.row} testID="voice-controls">
      {/* Mute */}
      <Pressable
        onPress={toggleMute}
        style={({ pressed }) => [
          styles.btn,
          isMuted ? styles.btnActive : styles.btnInactive,
          pressed && styles.btnPressed,
        ]}
        accessibilityLabel={strings.voice.muteA11y}
        accessibilityRole="button"
        testID="voice-control-mute"
      >
        <MaterialIcons name={isMuted ? strings.voice.iconMuted as MI : strings.voice.iconUnmuted as MI} size={20} color={palette.text} style={styles.iconMargin} />
        <Text style={styles.label}>
          {isMuted ? strings.voice.unmute : strings.voice.mute}
        </Text>
      </Pressable>

      {/* Deafen */}
      <Pressable
        onPress={toggleDeafen}
        style={({ pressed }) => [
          styles.btn,
          isDeafened ? styles.btnActive : styles.btnInactive,
          pressed && styles.btnPressed,
        ]}
        accessibilityLabel={strings.voice.deafenA11y}
        accessibilityRole="button"
        testID="voice-control-deafen"
      >
        <MaterialIcons name={isDeafened ? strings.voice.iconUndeafened as MI : strings.voice.iconDeafened as MI} size={20} color={palette.text} style={styles.iconMargin} />
        <Text style={styles.label}>
          {isDeafened ? strings.voice.undeafen : strings.voice.deafen}
        </Text>
      </Pressable>

      {/* Speaker/Earpiece */}
      <Pressable
        onPress={toggleSpeaker}
        style={({ pressed }) => [
          styles.btn,
          !isSpeakerOn ? styles.btnActive : styles.btnInactive,
          pressed && styles.btnPressed,
        ]}
        accessibilityLabel={strings.voice.speakerA11y}
        accessibilityRole="button"
        testID="voice-control-speaker"
      >
        <MaterialIcons name={isSpeakerOn ? strings.voice.iconSpeaker as MI : strings.voice.iconEarpiece as MI} size={20} color={palette.text} style={styles.iconMargin} />
        <Text style={styles.label}>
          {isSpeakerOn ? strings.voice.speaker : strings.voice.earpiece}
        </Text>
      </Pressable>

      {/* Disconnect */}
      <Pressable
        onPress={() => { void leave(); }}
        style={({ pressed }) => [
          styles.btn,
          styles.btnDanger,
          pressed && styles.btnPressed,
        ]}
        accessibilityLabel={strings.voice.disconnectA11y}
        accessibilityRole="button"
        testID="voice-control-disconnect"
      >
        <MaterialIcons name={strings.voice.iconDisconnect as MI} size={20} color="#ff6b6b" style={styles.iconMargin} />
        <Text style={[styles.label, styles.labelDanger]}>
          {strings.voice.disconnect}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  btn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: 6,
    minWidth: 64,
  },
  btnInactive: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  btnActive: {
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  btnDanger: {
    backgroundColor: 'rgba(220,20,60,0.6)',
  },
  btnPressed: {
    opacity: 0.7,
  },
  iconMargin: {
    marginBottom: 2,
  },
  label: {
    color: palette.text,
    fontSize: typography.caption.fontSize,
    fontWeight: '600',
  },
  labelDanger: {
    color: '#ff6b6b',
  },
});
