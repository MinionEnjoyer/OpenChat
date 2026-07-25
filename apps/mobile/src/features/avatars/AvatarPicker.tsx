import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { palette, spacing, typography } from '../../ui/tokens';
import { strings } from '../../ui/strings';

/**
 * FR-MED-020 — Reusable avatar / server-icon picker.
 *
 * Displays the current image (or a fallback) and provides a button to pick a
 * new square-cropped image. The parent owns the upload + patch logic via
 * the `onPick` callback; this component only handles rendering.
 *
 * @satisfies FR-MED-020
 */
export function AvatarPicker({
  currentUrl,
  size = 80,
  label,
  onPick,
  busy = false,
  error = null,
}: {
  currentUrl: string | null | undefined;
  size?: number;
  label: string;
  onPick: () => void;
  busy?: boolean;
  error?: string | null;
}): React.JSX.Element {
  return (
    <View style={styles.container} testID="avatar-picker">
      <Text style={styles.label}>{label}</Text>
      <Pressable
        onPress={onPick}
        disabled={busy}
        accessibilityLabel={label}
        testID="avatar-picker-image"
      >
        {currentUrl ? (
          <Image
            source={{ uri: currentUrl }}
            style={[styles.image, { width: size, height: size, borderRadius: size / 2 }]}
          />
        ) : (
          <View
            style={[
              styles.placeholder,
              { width: size, height: size, borderRadius: size / 2 },
            ]}
            testID="avatar-picker-placeholder"
          >
            <Text style={styles.placeholderText}>
              {strings.avatars.placeholder}
            </Text>
          </View>
        )}
      </Pressable>
      <Pressable
        style={[styles.pickButton, busy && styles.pickButtonDisabled]}
        onPress={onPick}
        disabled={busy}
        accessibilityLabel={strings.avatars.pickButton}
        testID="avatar-picker-button"
      >
        {busy ? (
          <ActivityIndicator color={palette.text} />
        ) : (
          <Text style={styles.pickButtonText}>{strings.avatars.pickButton}</Text>
        )}
      </Pressable>
      {error ? (
        <Text style={styles.errorText} testID="avatar-picker-error">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  label: {
    ...typography.caption,
    color: palette.textMuted,
    marginBottom: spacing.sm,
  },
  image: {
    backgroundColor: palette.bgElevated,
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.bgElevated,
    borderWidth: 2,
    borderColor: palette.textMuted,
    borderStyle: 'dashed',
  },
  placeholderText: {
    ...typography.caption,
    color: palette.textMuted,
    textAlign: 'center',
  },
  pickButton: {
    marginTop: spacing.sm,
    backgroundColor: palette.accent,
    borderRadius: 6,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  pickButtonDisabled: { opacity: 0.5 },
  pickButtonText: {
    ...typography.caption,
    color: palette.text,
    fontWeight: '700',
  },
  errorText: {
    ...typography.caption,
    color: palette.danger,
    marginTop: spacing.xs,
  },
});
