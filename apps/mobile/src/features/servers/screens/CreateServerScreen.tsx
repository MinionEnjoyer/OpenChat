import { useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { palette, spacing, typography } from '../../../ui/tokens';
import { strings } from '../../../ui/strings';
import { showToast } from '../../../ui/Toast';
import { api } from '../../../stores/session';
import { useQueryClient } from '@tanstack/react-query';
import { keys } from '../../../sync/keys';
import type { Server } from '../../../api/schema';

/**
 * FR-SRV-002 — Create server (name only; icon comes later via MED).
 * On success, invalidates the servers query so the rail picks up the new server.
 * The owner is added to the default #general channel automatically by the backend.
 *
 * @satisfies FR-SRV-002
 */
export function CreateServerScreen({ onDone }: { onDone: (serverId?: string) => void }): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();

  const submit = async (): Promise<void> => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const server = await api.request<Server>('/servers', {
        method: 'POST',
        body: { name: trimmed },
      });
      // Invalidate servers list so the shell rail shows the new server.
      await queryClient.invalidateQueries({ queryKey: keys.servers });
      onDone(server.id);
    } catch {
      showToast(strings.servers.createFailed, () => void submit());
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'android' ? insets.top : 0}
      testID="create-server-screen"
    >
      <Text style={styles.title}>{strings.servers.createTitle}</Text>
      <TextInput
        style={styles.input}
        placeholder={strings.servers.createNamePlaceholder}
        placeholderTextColor={palette.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        value={name}
        onChangeText={setName}
        onSubmitEditing={() => void submit()}
        accessibilityLabel={strings.servers.createNamePlaceholder}
        testID="create-server-name"
      />
      <View style={styles.row}>
        <Pressable
          style={styles.cancelButton}
          onPress={() => onDone()}
          testID="create-server-cancel"
        >
          <Text style={styles.cancelText}>{strings.common.cancel}</Text>
        </Pressable>
        <Pressable
          style={[styles.button, (!trimmed || busy) && styles.buttonDisabled]}
          onPress={() => void submit()}
          accessibilityLabel={strings.servers.createButton}
          testID="create-server-submit"
        >
          {busy ? (
            <ActivityIndicator color={palette.text} />
          ) : (
            <Text style={styles.buttonText}>{strings.servers.createButton}</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function trimmed(name: string): string {
  return name.trim();
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  title: { ...typography.title, color: palette.text, marginBottom: spacing.xl },
  input: {
    ...typography.body,
    alignSelf: 'stretch',
    backgroundColor: palette.bgElevated,
    color: palette.text,
    borderRadius: 8,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    gap: spacing.sm,
  },
  button: {
    flex: 1,
    backgroundColor: palette.accent,
    borderRadius: 8,
    padding: spacing.md,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { ...typography.body, color: palette.text, fontWeight: '700' },
  cancelButton: {
    flex: 1,
    backgroundColor: palette.bgElevated,
    borderRadius: 8,
    padding: spacing.md,
    alignItems: 'center',
  },
  cancelText: { ...typography.body, color: palette.textMuted },
});
