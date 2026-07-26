/**
 * FR-SRV-006 — Join server overlay (code entry).
 *
 * Allows a user to type an invite code manually and then shows the preview.
 */
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { palette, spacing, typography } from '../../../ui/tokens';
import { strings } from '../../../ui/strings';
import { showToast } from '../../../ui/Toast';
import { api } from '../../../stores/session';
import type { InvitePreview } from '../../../api/schema';

interface Props {
  visible: boolean;
  onClose: () => void;
  onJoined: (serverId: string) => void;
}

export function JoinServerOverlay({ visible, onClose, onJoined }: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const [code, setCode] = useState('');
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);

  const lookup = async (): Promise<void> => {
    const trimmed = code.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    setPreview(null);
    try {
      const p = await api.request<InvitePreview>(`/invites/${encodeURIComponent(trimmed)}`);
      setPreview(p);
    } catch {
      setError(strings.invites.invalidCode);
    } finally {
      setLoading(false);
    }
  };

  const accept = async (): Promise<void> => {
    if (accepting || !preview) return;
    setAccepting(true);
    try {
      const server = await api.request<{ id: string }>(
        `/invites/${encodeURIComponent(preview.code)}/accept`,
        { method: 'POST' },
      );
      onJoined(server.id);
      onClose();
    } catch {
      showToast(strings.invites.acceptFailed);
    } finally {
      setAccepting(false);
    }
  };

  const dismiss = (): void => {
    setCode('');
    setPreview(null);
    setError(null);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={dismiss}
      testID="join-server-overlay"
    >
      <KeyboardAvoidingView
        style={styles.kavRoot}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === 'android' ? insets.top : 0}
      >
        <Pressable style={styles.scrim} onPress={dismiss} testID="join-server-scrim">
          <View />
        </Pressable>
        <View style={styles.sheet} testID="join-server-sheet">
        {!preview ? (
          <>
            <Text style={styles.title}>{strings.invites.joinTitle}</Text>
            <TextInput
              style={styles.input}
              placeholder={strings.invites.codePlaceholder}
              placeholderTextColor={palette.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              value={code}
              onChangeText={setCode}
              onSubmitEditing={() => void lookup()}
              accessibilityLabel={strings.invites.codePlaceholder}
              testID="invite-code-input"
            />
            {error && <Text style={styles.error}>{error}</Text>}
            <View style={styles.buttons}>
              <Pressable
                style={[styles.button, styles.declineButton]}
                onPress={dismiss}
                testID="join-cancel"
              >
                <Text style={styles.buttonText}>{strings.common.cancel}</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.button,
                  styles.acceptButton,
                  (!code.trim() || loading) && styles.buttonDisabled,
                ]}
                onPress={() => void lookup()}
                disabled={!code.trim() || loading}
                testID="join-lookup"
              >
                {loading ? (
                  <ActivityIndicator color={palette.text} />
                ) : (
                  <Text style={styles.buttonText}>{strings.invites.join}</Text>
                )}
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.title}>{strings.invites.previewTitle}</Text>
            <View style={styles.row}>
              <Text style={styles.label}>{strings.invites.previewServer}</Text>
              <Text style={styles.value}>{preview.server.name}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>{strings.invites.previewInviter}</Text>
              <Text style={styles.value}>{preview.inviter.username}</Text>
            </View>
            <View style={styles.buttons}>
              <Pressable
                style={[styles.button, styles.declineButton]}
                onPress={dismiss}
                testID="join-decline"
              >
                <Text style={styles.buttonText}>{strings.invites.decline}</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.button,
                  styles.acceptButton,
                  accepting && styles.buttonDisabled,
                ]}
                onPress={() => void accept()}
                disabled={accepting}
                testID="join-accept"
              >
                {accepting ? (
                  <ActivityIndicator color={palette.text} />
                ) : (
                  <Text style={styles.buttonText}>{strings.invites.accept}</Text>
                )}
              </Pressable>
            </View>
          </>
        )}
      </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  kavRoot: { flex: 1 },
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: palette.bgElevated,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: spacing.lg,
  },
  title: {
    ...typography.title,
    color: palette.text,
    fontSize: 22,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  input: {
    ...typography.body,
    backgroundColor: palette.bg,
    color: palette.text,
    borderRadius: 8,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  error: {
    ...typography.body,
    color: palette.danger,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: palette.bg,
  },
  label: {
    ...typography.caption,
    color: palette.textMuted,
  },
  value: {
    ...typography.body,
    color: palette.text,
    fontWeight: '600',
  },
  buttons: {
    flexDirection: 'row',
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  button: {
    flex: 1,
    padding: spacing.md,
    borderRadius: 8,
    alignItems: 'center',
  },
  declineButton: {
    backgroundColor: palette.bg,
  },
  acceptButton: {
    backgroundColor: palette.accent,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    ...typography.body,
    color: palette.text,
    fontWeight: '700',
  },
});
