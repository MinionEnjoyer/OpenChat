import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { palette, spacing, typography } from '../../ui/tokens';
import { strings } from '../../ui/strings';
import type { ReactionGroup } from '../../domain/reactions';

interface Props {
  visible: boolean;
  emoji: string;
  reactions: ReactionGroup[];
  onClose: () => void;
}

export function ReactorListSheet({ visible, emoji, reactions, onClose }: Props): React.JSX.Element {
  const group = reactions.find((r) => r.emoji === emoji);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} testID="reactor-list-sheet">
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View />
      </Pressable>
      <View style={styles.sheet}>
        <View style={styles.header}>
          <Text style={styles.title}>
            {strings.reactions.reactorListTitle}
            {strings.reactions.noReactors}
            {emoji}
          </Text>
          <Pressable onPress={onClose} accessibilityLabel={strings.common.cancel}>
            <Text style={styles.cancelText}>{strings.common.cancel}</Text>
          </Pressable>
        </View>
        {group ? (
          <View style={styles.list}>
            {group.userIds.map((uid) => (
              <Text key={uid} style={styles.userId}>{uid.slice(0, 8)}</Text>
            ))}
          </View>
        ) : (
          <Text style={styles.empty}>{strings.reactions.noReactors}</Text>
        )}
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
    paddingBottom: spacing.xl,
    maxHeight: '50%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: palette.bg,
  },
  title: { ...typography.body, color: palette.text, fontWeight: '700' },
  cancelText: { ...typography.body, color: palette.accent },
  list: { padding: spacing.md },
  userId: { ...typography.body, color: palette.text, paddingVertical: spacing.xs },
  empty: { ...typography.caption, color: palette.textMuted, textAlign: 'center', padding: spacing.lg },
});
