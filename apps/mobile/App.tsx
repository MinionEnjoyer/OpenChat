import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './src/sync/queryClient';
import { useSession } from './src/stores/session';
import { LoginScreen } from './src/features/auth';
import { ShellScreen } from './src/features/shell';
import { ToastHost } from './src/ui/Toast';
import { palette } from './src/ui/tokens';
import { initializePush } from './src/features/notifications';

/**
 * Root: restore the session from the vault (FR-AUTH-003), then route —
 * signedIn → shell, signedOut → login. Navigation stacks arrive with deep
 * links (FR-APP-005, Phase 3).
 *
 * GestureHandlerRootView wraps the entire app — required by
 * react-native-gesture-handler for drawer gestures (DR-005).
 */
export default function App(): React.JSX.Element {
  const status = useSession((s) => s.status);
  const restore = useSession((s) => s.restore);

  useEffect(() => {
    void restore();
  }, [restore]);

  // FR-NOTIF-002: Initialize push notifications once the user is signed in
  useEffect(() => {
    if (status === 'signedIn') {
      void initializePush();
    }
  }, [status]);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <View style={styles.root}>
            <StatusBar style="light" />
            {status === 'restoring' ? (
              <View style={styles.center} testID="restoring">
                <ActivityIndicator color={palette.accent} size="large" />
              </View>
            ) : status === 'signedIn' ? (
              <ShellScreen />
            ) : (
              <LoginScreen />
            )}
            <ToastHost />
          </View>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
