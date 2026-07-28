import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { palette, spacing, typography } from '../../ui/tokens';
import { strings } from '../../ui/strings';

export interface MessageAction {
  /** Stable id for testID derivation: msg-action-{id} */
  id: string;
  label: string;
  destructive?: boolean;
  onPress: () => void;
}

interface Props {
  visible: boolean;
  actions: MessageAction[];
  onClose: () => void;
}

export function MessageActionSheet({ visible, actions, onClose }: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} testID="message-action-sheet">
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View />
      </Pressable>
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
        {actions.map((action) => (
          <Pressable
            key={action.id}
            style={styles.actionRow}
            onPress={() => { action.onPress(); onClose(); }}
            testID={`msg-action-${action.id}`}
          >
            <Text
              style={[
                styles.actionText,
                action.destructive && styles.actionDestructive,
              ]}
            >
              {action.label}
            </Text>
          </Pressable>
        ))}
        <Pressable
          style={[styles.actionRow, styles.cancelRow]}
          onPress={onClose}
          testID="msg-action-cancel"
        >
          <Text style={styles.cancelText}>{strings.common.cancel}</Text>
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
  },
  actionRow: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.bg,
  },
  actionText: {
    ...typography.body,
    color: palette.text,
    textAlign: 'center',
  },
  actionDestructive: {
    color: palette.danger,
  },
  cancelRow: {
    marginTop: spacing.sm,
    borderBottomWidth: 0,
  },
  cancelText: {
    ...typography.body,
    color: palette.textMuted,
    textAlign: 'center',
    fontWeight: '700',
  },
});
