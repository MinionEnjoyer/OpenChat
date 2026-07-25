import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { palette, spacing, typography } from '../../ui/tokens';
import { strings } from '../../ui/strings';
import { filterEmojis } from '../../domain/reactions';

interface Props {
  visible: boolean;
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

const COLS = 5;

export function EmojiPicker({ visible, onSelect, onClose }: Props): React.JSX.Element {
  const [query, setQuery] = useState('');
  const results = filterEmojis(query);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View />
      </Pressable>
      <View style={styles.sheet}>
        <View style={styles.header}>
          <Text style={styles.title}>{strings.reactions.pickerTitle}</Text>
          <Pressable onPress={onClose} accessibilityLabel={strings.common.cancel}>
            <Text style={styles.cancelText}>{strings.common.cancel}</Text>
          </Pressable>
        </View>
        <TextInput
          style={styles.search}
          placeholder={strings.reactions.pickerSearchPlaceholder}
          placeholderTextColor={palette.textMuted}
          value={query}
          onChangeText={setQuery}
          autoFocus={false}
        />
        <View style={styles.grid}>
          {results.map((e) => (
            <Pressable
              key={e.emoji}
              style={styles.emojiCell}
              onPress={() => { onSelect(e.emoji); setQuery(''); }}
              accessibilityLabel={e.label}
            >
              <Text style={styles.emojiText}>{e.emoji}</Text>
            </Pressable>
          ))}
        </View>
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
    maxHeight: '60%',
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
  search: {
    ...typography.body,
    color: palette.text,
    backgroundColor: palette.bg,
    margin: spacing.sm,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.sm,
  },
  emojiCell: {
    width: `${100 / COLS}%`,
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  emojiText: { fontSize: 28 },
});
