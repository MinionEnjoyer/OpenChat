/**
 * FR-SRV-006 — Invite create overlay (share sheet).
 *
 * For existing server members: create an invite, view the code, and share via native share sheet.
 */
import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { palette, spacing, typography } from '../../../ui/tokens';
import { strings } from '../../../ui/strings';
import { showToast } from '../../../ui/Toast';
import { api } from '../../../stores/session';
import { buildInviteLink } from '../../../domain/links';
import type { InviteResponse } from '../../../api/schema';

interface Props {
  serverId: string;
  serverName: string;
  visible: boolean;
  onClose: () => void;
}

export function InviteCreateOverlay({ serverId, serverName, visible, onClose }: Props): React.JSX.Element {
  const [invite, setInvite] = useState<InviteResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const create = async (): Promise<void> => {
    setLoading(true);
    try {
      const res = await api.request<InviteResponse>(
        `/servers/${serverId}/invites`,
        { method: 'POST', body: {} },
      );
      setInvite(res);
    } catch {
      showToast(strings.invites.createFailed);
    } finally {
      setLoading(false);
    }
  };

  const shareLink = async (): Promise<void> => {
    if (!invite) return;
    const link = buildInviteLink(invite.code);
    try {
      await Share.share({
        title: `${strings.invites.shareTitle} — ${serverName}`,
        message: link,
      });
    } catch {
      // user cancelled share — not an error
    }
  };

  const copyCode = async (): Promise<void> => {
    if (!invite) return;
    await Clipboard.setStringAsync(invite.code);
    showToast(strings.invites.copied);
  };

  const dismiss = (): void => {
    setInvite(null);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={dismiss}
      testID="invite-create-overlay"
    >
      <Pressable style={styles.scrim} onPress={dismiss} testID="invite-create-scrim">
        <View />
      </Pressable>
      <View style={styles.sheet} testID="invite-create-sheet">
        <Text style={styles.title}>{strings.invites.createTitle}</Text>
        <Text style={styles.subtitle}>{serverName}</Text>

        {!invite ? (
          <Pressable
            style={[styles.primaryButton, loading && styles.buttonDisabled]}
            onPress={() => void create()}
            disabled={loading}
            testID="invite-create-button"
          >
            {loading ? (
              <ActivityIndicator color={palette.text} />
            ) : (
              <Text style={styles.buttonText}>{strings.invites.createInvite}</Text>
            )}
          </Pressable>
        ) : (
          <>
            <View style={styles.codeBox}>
              <Text style={styles.codeLabel}>{strings.invites.codePlaceholder}</Text>
              <Text style={styles.codeValue} testID="invite-code-text">{invite.code}</Text>
            </View>
            <View style={styles.buttons}>
              <Pressable
                style={[styles.button, styles.secondaryButton]}
                onPress={() => void copyCode()}
                testID="invite-copy"
              >
                <Text style={styles.buttonText}>{strings.invites.copy}</Text>
              </Pressable>
              <Pressable
                style={[styles.button, styles.accentButton]}
                onPress={() => void shareLink()}
                testID="invite-share"
              >
                <Text style={styles.buttonText}>{strings.invites.shareTitle}</Text>
              </Pressable>
            </View>
          </>
        )}

        <Pressable
          style={[styles.button, styles.cancelButton, { marginTop: spacing.sm }]}
          onPress={dismiss}
          testID="invite-create-close"
        >
          <Text style={styles.closeText}>{strings.common.cancel}</Text>
        </Pressable>
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
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.caption,
    color: palette.textMuted,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  codeBox: {
    backgroundColor: palette.bg,
    borderRadius: 8,
    padding: spacing.md,
    marginBottom: spacing.md,
    alignItems: 'center',
  },
  codeLabel: {
    ...typography.caption,
    color: palette.textMuted,
    marginBottom: spacing.xs,
  },
  codeValue: {
    ...typography.body,
    color: palette.text,
    fontWeight: '700',
    fontSize: 20,
    letterSpacing: 2,
  },
  buttons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  button: {
    flex: 1,
    padding: spacing.md,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: palette.accent,
    padding: spacing.md,
    borderRadius: 8,
    alignItems: 'center',
  },
  secondaryButton: {
    backgroundColor: palette.bg,
  },
  accentButton: {
    backgroundColor: palette.accent,
  },
  cancelButton: {
    backgroundColor: 'transparent',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    ...typography.body,
    color: palette.text,
    fontWeight: '700',
  },
  closeText: {
    ...typography.body,
    color: palette.textMuted,
  },
});
