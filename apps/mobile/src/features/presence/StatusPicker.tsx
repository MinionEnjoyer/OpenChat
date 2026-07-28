import { useCallback, useState } from 'react';
import {
  Modal, Pressable, StyleSheet, Text, View,
} from 'react-native';
import { palette, spacing, typography } from '../../ui/tokens';
import { strings } from '../../ui/strings';
import { gateway } from '../../realtime';
import type { User } from '../../api/schema';

/** Valid presence statuses the user can explicitly set. OFFLINE is server-managed. */
export const SETTABLE_STATUSES = ['ONLINE', 'AWAY', 'DND', 'INVISIBLE'] as const;

export type SettableStatus = (typeof SETTABLE_STATUSES)[number];

const STATUS_LABELS: Record<SettableStatus, string> = {
  ONLINE: 'Online',
  AWAY: 'Idle',
  DND: 'Do Not Disturb',
  INVISIBLE: 'Invisible',
};

const STATUS_COLORS: Record<SettableStatus, string> = {
  ONLINE: '#23a55a',
  AWAY: '#f0b232',
  DND: '#f23f43',
  INVISIBLE: '#80848e',
};

/**
 * FR-AUTH-007 — Presence status picker.
 *
 * Displays the current status with a colored dot. Tapping opens a modal
 * allowing the user to choose online/idle/dnd/invisible.
 * Updates persist via PATCH /auth/me and broadcast via WS presence.update.
 *
 * @satisfies FR-AUTH-007
 */
export function StatusPicker({
  user,
  onUpdate,
}: {
  user: User;
  onUpdate: (status: SettableStatus) => Promise<void>;
}): React.JSX.Element {
  const [visible, setVisible] = useState(false);
  const currentStatus: SettableStatus = SETTABLE_STATUSES.includes(user.status as SettableStatus)
    ? (user.status as SettableStatus)
    : 'ONLINE';

  const select = useCallback(
    (status: SettableStatus) => {
      setVisible(false);
      // Optimistic: WS frame goes out before the PATCH resolves.
      gateway.send('presence.update', { status });
      void onUpdate(status);
    },
    [onUpdate],
  );

  const color = STATUS_COLORS[currentStatus];

  return (
    <>
      <Pressable
        style={styles.picker}
        onPress={() => setVisible(true)}
        accessibilityLabel={strings.presence.statusLabel}
        accessibilityRole="button"
        testID="presence-picker"
      >
        <View style={[styles.dot, { backgroundColor: color }]} />
        <Text style={styles.statusText}>
          {STATUS_LABELS[currentStatus]}
        </Text>
        <Text style={styles.chevron}>{strings.presence.chevronDown}</Text>
      </Pressable>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => setVisible(false)}
          testID="presence-backdrop"
        >
          <View style={styles.menu}>
            <Text style={styles.menuTitle}>{strings.presence.title}</Text>
            {SETTABLE_STATUSES.map((status) => (
              <Pressable
                key={status}
                style={[
                  styles.option,
                  status === currentStatus && styles.optionActive,
                ]}
                onPress={() => select(status)}
                accessibilityLabel={STATUS_LABELS[status]}
                testID={`presence-option-${status.toLowerCase()}`}
              >
                <View
                  style={[styles.optionDot, { backgroundColor: STATUS_COLORS[status] }]}
                />
                <Text style={styles.optionText}>{STATUS_LABELS[status]}</Text>
                {status === currentStatus && (
                  <Text style={styles.check}>{strings.presence.checkmark}</Text>
                )}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  picker: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.bg,
    borderRadius: 6,
    padding: spacing.sm,
    marginBottom: spacing.xs,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: spacing.sm,
  },
  statusText: {
    ...typography.body,
    color: palette.text,
    flex: 1,
  },
  chevron: {
    ...typography.caption,
    color: palette.textMuted,
    marginLeft: spacing.sm,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menu: {
    backgroundColor: palette.bgElevated,
    borderRadius: 12,
    padding: spacing.md,
    width: 260,
  },
  menuTitle: {
    ...typography.body,
    color: palette.text,
    fontWeight: '700',
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: 6,
  },
  optionActive: {
    backgroundColor: palette.bg,
  },
  optionDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: spacing.sm,
  },
  optionText: {
    ...typography.body,
    color: palette.text,
    flex: 1,
  },
  check: {
    ...typography.body,
    color: palette.accent,
    fontWeight: '700',
  },
});
