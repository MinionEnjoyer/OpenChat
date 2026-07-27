import { useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { palette, spacing, typography } from '../../../ui/tokens';
import { strings } from '../../../ui/strings';
import { showToast } from '../../../ui/Toast';
import { useSession } from '../../../stores/session';

/**
 * P1-04 — Login.
 *
 * - dev / E2E builds: username field → POST /auth/dev-login (deterministic lane).
 * - production builds: "Sign in" button → PKCE system-browser flow against the
 *   configured OIDC provider (FR-AUTH-001).
 *
 * Path selection is compile-time via `__DEV__`: Expo inlines this at bundle time
 * so a production APK never ships the dev-login UI.
 */
const USE_DEV_LOGIN = __DEV__;

export function LoginScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const devLogin = useSession((s) => s.devLogin);
  const loginWithPkce = useSession((s) => s.loginWithPkce);

  const submitDevLogin = async (): Promise<void> => {
    if (!username.trim() || busy) return;
    setBusy(true);
    try {
      await devLogin(username.trim());
    } catch {
      showToast(strings.auth.loginFailed, () => void submitDevLogin());
    } finally {
      setBusy(false);
    }
  };

  const submitPkce = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      await loginWithPkce();
    } catch {
      showToast(strings.auth.loginFailed, () => void submitPkce());
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'android' ? insets.top : 0}
      testID="login-screen"
    >
      <Text style={styles.title} testID="login-title">
        {USE_DEV_LOGIN ? strings.auth.title : 'OpenChat'}
      </Text>
      {USE_DEV_LOGIN ? (
        <>
          <Text style={styles.subtitle}>{strings.auth.subtitle}</Text>
          <TextInput
            style={styles.input}
            placeholder={strings.auth.usernamePlaceholder}
            placeholderTextColor={palette.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            value={username}
            onChangeText={setUsername}
            onSubmitEditing={() => void submitDevLogin()}
            accessibilityLabel={strings.auth.usernamePlaceholder}
            testID="login-username"
          />
        </>
      ) : (
        <Text style={styles.subtitle}>
          Sign in with your OpenChat account to continue.
        </Text>
      )}
      <Pressable
        style={[
          styles.button,
          (USE_DEV_LOGIN && !username.trim()) || busy ? styles.buttonDisabled : null,
        ]}
        onPress={() => void (USE_DEV_LOGIN ? submitDevLogin() : submitPkce())}
        accessibilityLabel={
          USE_DEV_LOGIN ? strings.auth.devLoginButton : 'Sign in'
        }
        testID="login-submit"
      >
        {busy ? (
          <ActivityIndicator color={palette.text} />
        ) : (
          <Text style={styles.buttonText}>
            {USE_DEV_LOGIN ? strings.auth.devLoginButton : 'Sign in'}
          </Text>
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
