/**
 * FR-SRV-006 — Invite preview overlay.
 *
 * Shown when a user opens an invite deep link or enters a code.
 * Displays server name, inviter, and accept/decline buttons.
 * On accept, calls POST /invites/:code/accept and returns the server.
 */
import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { palette, spacing, typography } from '../../../ui/tokens';
import { strings } from '../../../ui/strings';
import { showToast } from '../../../ui/Toast';
import { api } from '../../../stores/session';
import type { InvitePreview } from '../../../api/schema';

interface Props {
  code: string;
  visible: boolean;
  onClose: () => void;
  onAccepted: (serverId: string) => void;
}

export function InvitePreviewOverlay({ code, visible, onClose, onAccepted }: Props): React.JSX.Element {
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [fetched, setFetched] = useState(false);

  // Fetch preview when code changes or becomes visible
  if (visible && code && !fetched) {
    setFetched(true);
    setLoading(true);
    setError(null);
    setPreview(null);
    api.request<InvitePreview>(`/invites/${encodeURIComponent(code)}`)
      .then((p) => { setPreview(p); setLoading(false); })
      .catch(() => { setError(strings.invites.invalidCode); setLoading(false); });
  }

  // Reset when hidden
  if (!visible && fetched) {
    // Defer reset to avoid setState-during-render
    setTimeout(() => {
      setFetched(false);
      setPreview(null);
      setError(null);
      setLoading(false);
      setAccepting(false);
    }, 0);
  }

  const accept = async (): Promise<void> => {
    if (accepting) return;
    setAccepting(true);
    try {
      const server = await api.request<{ id: string }>(
        `/invites/${encodeURIComponent(code)}/accept`,
        { method: 'POST' },
      );
      onAccepted(server.id);
      onClose();
    } catch {
      showToast(strings.invites.acceptFailed);
    } finally {
      setAccepting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      testID="invite-preview-overlay"
    >
      <Pressable style={styles.scrim} onPress={onClose} testID="invite-preview-scrim">
        <View />
      </Pressable>
      <View style={styles.sheet} testID="invite-preview-sheet">
        <Text style={styles.title}>{strings.invites.previewTitle}</Text>

        {loading ? (
          <ActivityIndicator color={palette.accent} style={styles.loader} />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : preview ? (
          <>
            <View style={styles.row}>
              <Text style={styles.label}>{strings.invites.previewServer}</Text>
              <Text style={styles.value}>{preview.server.name}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>{strings.invites.previewInviter}</Text>
              <Text style={styles.value}>{preview.inviter.username}</Text>
            </View>
            {preview.expiresAt && (
              <Text style={styles.expires}>
                {strings.invites.expiresLabel} {new Date(preview.expiresAt).toLocaleDateString()}
              </Text>
            )}
          </>
        ) : null}

        <View style={styles.buttons}>
          <Pressable
            style={[styles.button, styles.declineButton]}
            onPress={onClose}
            testID="invite-decline"
          >
            <Text style={styles.buttonText}>{strings.invites.decline}</Text>
          </Pressable>
          <Pressable
            style={[
              styles.button,
              styles.acceptButton,
              (accepting || !preview) && styles.buttonDisabled,
            ]}
            onPress={() => void accept()}
            disabled={accepting || !preview}
            testID="invite-accept"
          >
            {accepting ? (
              <ActivityIndicator color={palette.text} />
            ) : (
              <Text style={styles.buttonText}>{strings.invites.accept}</Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
  loader: {
    marginVertical: spacing.xl,
  },
  error: {
    ...typography.body,
    color: palette.danger,
    textAlign: 'center',
    marginVertical: spacing.lg,
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
  expires: {
    ...typography.caption,
    color: palette.textMuted,
    marginTop: spacing.sm,
    textAlign: 'center',
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
