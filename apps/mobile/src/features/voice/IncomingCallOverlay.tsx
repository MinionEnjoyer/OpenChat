/**
 * IncomingCallOverlay — full-screen accept/decline UI (FR-VOX-005).
 *
 * Renders a full-screen overlay when the CallStore has an incoming call.
 * Shows the caller's name, an accept button (joins the call), and a decline
 * button (dismisses). Uses the existing VoiceStore.join() on accept.
 *
 * @satisfies FR-VOX-005
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { palette, spacing, typography } from '../../ui/tokens';
import { strings } from '../../ui/strings';
import { useCallStore } from './CallStore';
import { useVoiceConnection } from './useVoiceConnection';

export function IncomingCallOverlay(): React.JSX.Element | null {
  const incomingCall = useCallStore((s) => s.incomingCall);
  const dismiss = useCallStore((s) => s.dismiss);
  const accept = useCallStore((s) => s.accept);
  const { join } = useVoiceConnection();

  if (!incomingCall) return null;

  const handleAccept = () => {
    // Dismiss the overlay first, then join.
    const { channelId } = incomingCall;
    accept();
    void join(channelId);
  };

  return (
    <View style={styles.backdrop} testID="incoming-call-overlay">
      <View style={styles.card}>
        <Text style={styles.heading}>{strings.voice.incomingCall}</Text>
        <Text style={styles.callerName}>{incomingCall.callerName}</Text>
        <Text style={styles.subtitle}>{strings.voice.incomingCallSubtitle}</Text>

        <View style={styles.buttons}>
          <Pressable
            onPress={handleAccept}
            style={({ pressed }) => [styles.btn, styles.btnAccept, pressed && styles.btnPressed]}
            accessibilityLabel={strings.voice.accept}
            testID="incoming-call-accept"
          >
            <Text style={styles.btnTextAccept}>{strings.voice.accept}</Text>
          </Pressable>
          <Pressable
            onPress={() => dismiss()}
            style={({ pressed }) => [styles.btn, styles.btnDecline, pressed && styles.btnPressed]}
            accessibilityLabel={strings.voice.decline}
            testID="incoming-call-decline"
          >
            <Text style={styles.btnTextDecline}>{strings.voice.decline}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  card: {
    backgroundColor: '#2b2d31',
    borderRadius: 16,
    padding: spacing.xl,
    alignItems: 'center',
    minWidth: 280,
    maxWidth: '85%',
  },
  heading: {
    fontSize: 18,
    fontWeight: '600',
    color: palette.text,
    marginBottom: spacing.sm,
  },
  callerName: {
    fontSize: 28,
    fontWeight: '700',
    color: palette.text,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.body,
    color: palette.textMuted,
    marginBottom: spacing.lg,
  },
  buttons: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  btn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: 24,
    minWidth: 110,
    alignItems: 'center',
  },
  btnPressed: {
    opacity: 0.8,
  },
  btnAccept: {
    backgroundColor: '#23a55a', // Discord green
  },
  btnDecline: {
    backgroundColor: '#f23f43', // Discord red
  },
  btnTextAccept: {
    ...typography.body,
    color: palette.text,
    fontWeight: '700',
  },
  btnTextDecline: {
    ...typography.body,
    color: palette.text,
    fontWeight: '700',
  },
});
