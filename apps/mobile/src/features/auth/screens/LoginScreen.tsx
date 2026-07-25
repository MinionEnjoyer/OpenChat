import { useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput,
} from 'react-native';
import { palette, spacing, typography } from '../../../ui/tokens';
import { strings } from '../../../ui/strings';
import { showToast } from '../../../ui/Toast';
import { useSession } from '../../../stores/session';

/**
 * P1-04 — Login. The dev-login path is the deterministic E2E lane; the OIDC
 * system-browser flow (expo-auth-session against /auth/oidc-metadata) is the
 * nightly lane and arrives once an Authentik fixture exists (see LOG).
 */
export function LoginScreen(): React.JSX.Element {
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const devLogin = useSession((s) => s.devLogin);

  const submit = async (): Promise<void> => {
    if (!username.trim() || busy) return;
    setBusy(true);
    try {
      await devLogin(username.trim());
    } catch {
      // FR-APP-006: failed mutation → toast with retry, never silence.
      showToast(strings.auth.loginFailed, () => void submit());
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      testID="login-screen"
    >
      <Text style={styles.title} testID="login-title">
        {strings.auth.title}
      </Text>
      <Text style={styles.subtitle}>{strings.auth.subtitle}</Text>
      <TextInput
        style={styles.input}
        placeholder={strings.auth.usernamePlaceholder}
        placeholderTextColor={palette.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        value={username}
        onChangeText={setUsername}
        onSubmitEditing={() => void submit()}
        accessibilityLabel={strings.auth.usernamePlaceholder}
        testID="login-username"
      />
      <Pressable
        style={[styles.button, (!username.trim() || busy) && styles.buttonDisabled]}
        onPress={() => void submit()}
        accessibilityLabel={strings.auth.devLoginButton}
        testID="login-submit"
      >
        {busy ? (
          <ActivityIndicator color={palette.text} />
        ) : (
          <Text style={styles.buttonText}>{strings.auth.devLoginButton}</Text>
        )}
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  title: { ...typography.title, color: palette.text, marginBottom: spacing.xs },
  subtitle: { ...typography.caption, color: palette.textMuted, marginBottom: spacing.xl },
  input: {
    ...typography.body,
    alignSelf: 'stretch',
    backgroundColor: palette.bgElevated,
    color: palette.text,
    borderRadius: 8,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  button: {
    alignSelf: 'stretch',
    backgroundColor: palette.accent,
    borderRadius: 8,
    padding: spacing.md,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { ...typography.body, color: palette.text, fontWeight: '700' },
});
