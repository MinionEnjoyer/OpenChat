import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { palette, spacing, typography } from '../../ui/tokens';
import { strings } from '../../ui/strings';
import { api } from '../../stores/session';
import { keys } from '../../sync/keys';
import { useBlockedStore, useRevealedStore } from '../blocked-messages';
import type { Message } from '../../api/schema';

/**
 * Pins panel (FR-MSG-011): lists pinned messages for the current channel.
 * Opens as a bottom sheet overlay. Tapping a message is a no-op for now
 * (jump-to-message is FR-MSG-016, already built — reuse if straightforward).
 */
export function PinsPanel({ channelId, visible, onClose }: {
  channelId: string;
  visible: boolean;
  onClose: () => void;
}): React.JSX.Element {
  // FR-SOC-007: fetch blocked users once on mount
  useEffect(() => {
    void useBlockedStore.getState().fetch();
  }, []);

  const blockedIds = useBlockedStore((s) => s.blockedIds);
  const revealedIds = useRevealedStore((s) => s.revealedIds);
  const reveal = useRevealedStore((s) => s.reveal);

  const pins = useQuery({
    queryKey: keys.pins(channelId),
    queryFn: () => api.request<Message[]>(`/channels/${channelId}/pins`),
    enabled: visible,
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet} testID="pins-panel">
          <View style={styles.header}>
            <Text style={styles.title}>{strings.messages.pinsPanelTitle}</Text>
            <Pressable onPress={onClose} accessibilityLabel={strings.common.cancel}>
              <Text style={styles.close}>{strings.messages.closeIcon}</Text>
            </Pressable>
          </View>

          <FlatList
            data={pins.data ?? []}
            keyExtractor={(m) => m.id}
            renderItem={({ item }) => {
              // FR-SOC-007: collapse blocked users' messages
              if (blockedIds.has(item.authorId) && !revealedIds.has(item.id)) {
                return (
                  <Pressable
                    style={[styles.row, styles.rowBlocked]}
                    onPress={() => reveal(item.id)}
                    testID={`blocked-pin-${item.id}`}
                  >
                    <Text style={styles.blockedText}>{strings.blockedMessages.collapsed}</Text>
                  </Pressable>
                );
              }
              return (
                <View style={styles.row} testID={`pins-item-${item.id}`}>
                  <Text style={styles.author} numberOfLines={1}>
                    {item.authorId.slice(0, 8)}
                  </Text>
                  <Text style={styles.content} numberOfLines={3}>
                    {item.content}
                  </Text>
                </View>
              );
            }}
            ListEmptyComponent={
              <Text style={styles.empty}>{strings.messages.pinsEmpty}</Text>
            }
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: palette.bg,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '70%',
    paddingBottom: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: palette.bgElevated,
  },
  title: { ...typography.body, color: palette.text, fontWeight: '700' },
  close: { ...typography.body, color: palette.textMuted, fontSize: 18 },
  row: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: palette.bgElevated,
  },
  author: { ...typography.caption, color: palette.accent, fontWeight: '700', marginBottom: spacing.xs },
  content: { ...typography.body, color: palette.text },
  rowBlocked: {
    opacity: 0.5,
  },
  blockedText: { ...typography.caption, color: palette.textMuted },
  empty: {
    ...typography.caption,
    color: palette.textMuted,
    textAlign: 'center',
    padding: spacing.lg,
  },
});
