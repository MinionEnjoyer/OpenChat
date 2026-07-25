import { useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { palette, spacing, typography } from '../../../ui/tokens';
import { strings } from '../../../ui/strings';
import { showToast } from '../../../ui/Toast';
import { api, useSession } from '../../../stores/session';
import { useQueryClient } from '@tanstack/react-query';
import { keys } from '../../../sync/keys';
import { hasServerPermission, isServerOwner, Permission } from '../../../permissions';
import type { Server } from '../../../api/schema';
import { AvatarPicker, useAvatarUpload } from '../../avatars';
import { resolveConfig } from '../../../lib/config';

/**
 * FR-SRV-003 — Server settings: rename (MANAGE_SERVER) and delete (owner-only).
 * Both actions are permission-gated using the shared permission library.
 *
 * @satisfies FR-SRV-003
 */
export function ServerSettingsScreen({
  server,
  onDone,
}: {
  server: Server;
  onDone: (deleted?: boolean) => void;
}): React.JSX.Element {
  const user = useSession((s) => s.user);
  const [name, setName] = useState(server.name);
  const [busy, setBusy] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const queryClient = useQueryClient();
  const avatar = useAvatarUpload(resolveConfig().apiBaseUrl);

  const canRename = hasServerPermission(server.myPermissions, Permission.MANAGE_SERVER);
  const canDelete = isServerOwner(user?.id, server.ownerId);

  const handleIconPick = async (): Promise<void> => {
    if (busy) return;
    const result = await avatar.pickAndUpload();
    if (!result?.thumbnailUrl) return;
    setBusy(true);
    try {
      await api.request(`/servers/${server.id}`, {
        method: 'PATCH',
        body: { iconUrl: result.thumbnailUrl },
      });
      await queryClient.invalidateQueries({ queryKey: keys.servers });
      showToast(strings.avatars.iconSaved);
    } catch {
      showToast(strings.avatars.saveFailed, () => void handleIconPick());
    } finally {
      setBusy(false);
    }
  };

  const submitRename = async (): Promise<void> => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === server.name || busy) return;
    setBusy(true);
    try {
      await api.request(`/servers/${server.id}`, {
        method: 'PATCH',
        body: { name: trimmed },
      });
      await queryClient.invalidateQueries({ queryKey: keys.servers });
      showToast(strings.servers.renameSaved);
      onDone();
    } catch {
      showToast(strings.servers.renameFailed, () => void submitRename());
    } finally {
      setBusy(false);
    }
  };

  const submitDelete = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      await api.request(`/servers/${server.id}`, { method: 'DELETE' });
      await queryClient.invalidateQueries({ queryKey: keys.servers });
      onDone(true);
    } catch {
      showToast(strings.servers.deleteFailed, () => void submitDelete());
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      testID="server-settings-screen"
    >
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>{strings.servers.settingsTitle}</Text>

        {/* Server icon (FR-MED-020) */}
        <AvatarPicker
          currentUrl={server.iconUrl ? (server.iconUrl.startsWith('/') ? resolveConfig().apiBaseUrl + server.iconUrl : server.iconUrl) : null}
          label={strings.avatars.iconLabel}
          onPick={() => void handleIconPick()}
          busy={avatar.busy}
          error={avatar.error}
        />

        {/* Rename */}
        <Text style={styles.sectionLabel}>{strings.servers.renameLabel}</Text>
        <TextInput
          style={[styles.input, !canRename && styles.inputDisabled]}
          value={name}
          onChangeText={setName}
          editable={canRename}
          placeholderTextColor={palette.textMuted}
          testID="server-settings-name"
        />
        {canRename ? (
          <Pressable
            style={[styles.button, (name.trim() === server.name || busy) && styles.buttonDisabled]}
            onPress={() => void submitRename()}
            accessibilityLabel={strings.servers.renameSave}
            testID="server-settings-rename-save"
          >
            {busy ? (
              <ActivityIndicator color={palette.text} />
            ) : (
              <Text style={styles.buttonText}>{strings.servers.renameSave}</Text>
            )}
          </Pressable>
        ) : (
          <Text style={styles.muted} testID="server-settings-rename-denied">
            {strings.servers.renameDenied}
          </Text>
        )}

        {/* Delete */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{strings.servers.deleteTitle}</Text>
          {canDelete ? (
            <>
              {!deleteConfirm ? (
                <Pressable
                  style={styles.dangerButton}
                  onPress={() => setDeleteConfirm(true)}
                  testID="server-settings-delete-init"
                >
                  <Text style={styles.dangerText}>{strings.servers.deleteButton}</Text>
                </Pressable>
              ) : (
                <View testID="server-settings-delete-confirm">
                  <Text style={styles.warning}>{strings.servers.deleteConfirm}</Text>
                  <View style={styles.row}>
                    <Pressable
                      style={styles.cancelButton}
                      onPress={() => setDeleteConfirm(false)}
                      testID="server-settings-delete-cancel"
                    >
                      <Text style={styles.cancelText}>{strings.common.cancel}</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.dangerButton, busy && styles.buttonDisabled]}
                      onPress={() => void submitDelete()}
                      testID="server-settings-delete-confirm-btn"
                    >
                      <Text style={styles.dangerText}>{strings.servers.deleteConfirmButton}</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </>
          ) : (
            <Text style={styles.muted} testID="server-settings-delete-denied">
              {strings.servers.deleteDenied}
            </Text>
          )}
        </View>

        {/* Cancel */}
        <Pressable
          style={styles.cancelButton}
          onPress={() => onDone()}
          testID="server-settings-cancel"
        >
          <Text style={styles.cancelText}>{strings.common.cancel}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.bg,
  },
  scroll: {
    padding: spacing.lg,
    alignItems: 'center',
  },
  title: { ...typography.title, color: palette.text, marginBottom: spacing.xl },
  section: { alignSelf: 'stretch', marginTop: spacing.xl },
  sectionLabel: {
    ...typography.body,
    color: palette.textMuted,
    alignSelf: 'flex-start',
    marginBottom: spacing.xs,
  },
  input: {
    ...typography.body,
    alignSelf: 'stretch',
    backgroundColor: palette.bgElevated,
    color: palette.text,
    borderRadius: 8,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  inputDisabled: { opacity: 0.5 },
  button: {
    alignSelf: 'stretch',
    backgroundColor: palette.accent,
    borderRadius: 8,
    padding: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { ...typography.body, color: palette.text, fontWeight: '700' },
  dangerButton: {
    alignSelf: 'stretch',
    backgroundColor: palette.danger,
    borderRadius: 8,
    padding: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  dangerText: { ...typography.body, color: palette.text, fontWeight: '700' },
  warning: { ...typography.caption, color: palette.danger, marginTop: spacing.xs },
  muted: { ...typography.caption, color: palette.textMuted, marginTop: spacing.xs },
  row: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: palette.bgElevated,
    borderRadius: 8,
    padding: spacing.md,
    alignItems: 'center',
  },
  cancelText: { ...typography.body, color: palette.textMuted },
});
