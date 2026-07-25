/**
 * Toast (FR-APP-006): every failed mutation surfaces here with an optional
 * retry affordance — no silent failures. ui/ is a leaf, so the toast state
 * lives in this module rather than an app store.
 */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { palette, spacing, typography } from './tokens';
import { strings } from './strings';

interface ToastPayload {
  message: string;
  retry?: () => void;
}

type Listener = (toast: ToastPayload | null) => void;
let listener: Listener | null = null;
let current: ToastPayload | null = null;

export function showToast(message: string, retry?: () => void): void {
  current = retry ? { message, retry } : { message };
  listener?.(current);
}

export function ToastHost(): React.JSX.Element | null {
  const [toast, setToast] = useState<ToastPayload | null>(current);

  useEffect(() => {
    listener = setToast;
    return () => {
      if (listener === setToast) listener = null;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!toast) return null;
  return (
    <View style={styles.wrap} testID="toast">
      <Text style={styles.message} testID="toast-message">
        {toast.message}
      </Text>
      {toast.retry ? (
        <Pressable
          accessibilityLabel={strings.common.retry}
          testID="toast-retry"
          onPress={() => {
            const retry = toast.retry;
            setToast(null);
            current = null;
            retry?.();
          }}
        >
          <Text style={styles.retry}>{strings.common.retry}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    bottom: spacing.xl,
    left: spacing.md,
    right: spacing.md,
    backgroundColor: palette.bgElevated,
    borderRadius: 8,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderLeftWidth: 4,
    borderLeftColor: palette.danger,
  },
  message: { ...typography.body, color: palette.text, flex: 1 },
  retry: { ...typography.body, color: palette.accent, marginLeft: spacing.md, fontWeight: '700' },
});
