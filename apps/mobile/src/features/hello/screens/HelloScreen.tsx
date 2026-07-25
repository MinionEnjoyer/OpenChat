import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

import { palette, spacing, typography } from '../../../ui/tokens';
import { strings } from '../../../ui/strings';

/**
 * The skeleton's only screen (06 §7). It exists to prove the whole chain works
 * end to end — prebuild, release APK, install, launch, Maestro assertion,
 * screenshot artifact — before any product feature is built on top of it.
 *
 * testIDs are the handles the Maestro flow asserts on; renaming one breaks
 * e2e/flows/p0-17-hello.yaml.
 */
export function HelloScreen(): React.JSX.Element {
  return (
    <View style={styles.container} testID="hello-screen">
      <StatusBar style="light" />
      <Text style={styles.title} testID="hello-title">
        {strings.hello.title}
      </Text>
      <Text style={styles.subtitle} testID="hello-subtitle">
        {strings.hello.subtitle}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.bg,
    padding: spacing.lg,
  },
  title: {
    ...typography.title,
    color: palette.text,
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.caption,
    color: palette.textMuted,
    textAlign: 'center',
  },
});
