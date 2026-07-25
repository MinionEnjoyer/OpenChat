/**
 * StatusPicker — FR-SOC-004 / FR-AUTH-007. Own presence status picker.
 * Sends `presence.update` via the gateway. Renders as a bottom-sheet modal.
 *
 * @satisfies FR-SOC-004
 * @satisfies FR-AUTH-007
 */
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { palette, spacing, typography } from '../../ui/tokens';
import { strings } from '../../ui/strings';
import { gateway } from '../../realtime';
import { presenceColor, presenceLabel } from './PresenceDot';

const STATUSES = ['ONLINE', 'AWAY', 'DND', 'INVISIBLE'] as const;

interface Props {
  currentStatus: string;
  onClose: () => void;
}

/**
 * Renders a list of presence statuses in a bottom-sheet modal. Tapping one
 * sends `presence.update` via the gateway and closes. The server persists
 * the status in the DB and broadcasts the change to all peers.
 */
export function StatusPicker({ currentStatus, onClose }: Props): React.JSX.Element {
  const handleSelect = (status: string) => {
    gateway.send('presence.update', { status });
    onClose();
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View />
      </Pressable>
      <View style={styles.sheet}>
        <Text style={styles.heading}>{strings.presence.setStatus}</Text>
        {STATUSES.map((status) => {
          const active = currentStatus === status;
          return (
            <Pressable
              key={status}
              style={[styles.row, active && styles.rowActive]}
              onPress={() => handleSelect(status)}
              testID={`status-${status.toLowerCase()}`}
            >
              <View style={[styles.dot, { backgroundColor: presenceColor(status) }]} />
              <Text style={[styles.label, active && styles.labelActive]}>
                {presenceLabel(status)}
              </Text>
              {active && <Text style={styles.check}>{strings.presence.activeCheck}</Text>}
            </Pressable>
          );
        })}
        <Pressable style={styles.cancelRow} onPress={onClose}>
          <Text style={styles.cancelLabel}>{strings.common.cancel}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
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
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  heading: {
    ...typography.caption,
    color: palette.textMuted,
    textTransform: 'uppercase',
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm,
    borderRadius: 6,
    marginBottom: 2,
  },
  rowActive: {
    backgroundColor: `${palette.accent}22`,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: spacing.sm,
  },
  label: {
    ...typography.body,
    color: palette.text,
    flex: 1,
  },
  labelActive: {
    fontWeight: '700',
    color: palette.accent,
  },
  check: {
    ...typography.caption,
    color: palette.accent,
  },
  cancelRow: {
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  cancelLabel: {
    ...typography.body,
    color: palette.textMuted,
  },
});
