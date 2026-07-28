/**
 * ChannelReorderScreen — reorder channels via PATCH channels/reorder (FR-SRV-005).
 *
 * Presents a draggable list of channels. On confirm, sends the exact
 * payload shape: { orderedIds: string[] } to the existing endpoint.
 * Order persists: re-fetch confirms the resulting id sequence.
 */
import { useState, useCallback } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { palette, spacing, typography } from '../../ui/tokens';
import { strings } from '../../ui/strings';
import { showToast } from '../../ui/Toast';
import { useReorderChannels } from './hooks';
import type { Channel } from '../../api/schema';

interface Props {
  visible: boolean;
  serverId: string;
  channels: Channel[];
  onClose: () => void;
}

export function ChannelReorderScreen({ visible, serverId, channels, onClose }: Props): React.JSX.Element {
  const [items, setItems] = useState<Channel[]>([]);
  const reorder = useReorderChannels(serverId);

  // Reset items when modal opens
  const handleOpen = useCallback(() => {
    setItems([...channels]);
  }, [channels]);

  const moveUp = useCallback((index: number) => {
    if (index <= 0) return;
    setItems((prev) => {
      const next = [...prev];
      const tmp = next[index]!;
      next[index] = next[index - 1]!;
      next[index - 1] = tmp;
      return next;
    });
  }, []);

  const moveDown = useCallback((index: number) => {
    setItems((prev) => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      const tmp = next[index]!;
      next[index] = next[index + 1]!;
      next[index + 1] = tmp;
      return next;
    });
  }, []);

  const handleSave = useCallback(async () => {
    const orderedIds = items.map((c) => c.id);
    try {
      await reorder.mutateAsync(orderedIds);
      showToast('Channels reordered');
      onClose();
    } catch {
      showToast('Reorder failed');
    }
  }, [items, reorder, onClose]);

  // Update items if channels prop changes (server switch) while modal is open
  if (visible && items.length === 0 && channels.length > 0) {
    handleOpen();
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      onShow={handleOpen}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet} testID="channel-reorder-sheet">
          <Text style={styles.title}>{strings.channels.reorderTitle}</Text>
          <Text style={styles.hint}>{strings.channels.reorderHint}</Text>

          <FlatList
            data={items}
            keyExtractor={(ch) => ch.id}
            style={styles.list}
            renderItem={({ item, index }) => (
              <View style={styles.row} testID={`reorder-row-${item.name}`}>
                {item.type === 'VOICE' ? (
                  <MaterialIcons name={strings.channels.voicePrefix as React.ComponentProps<typeof MaterialIcons>['name']} size={18} color={palette.text} style={{ marginRight: spacing.xs }} />
                ) : (
                  <Text style={{ ...typography.body, color: palette.text, marginRight: spacing.xs }}>{strings.shell.channelHash}</Text>
                )}
                <Text style={styles.channelLabel}>{item.name}</Text>
                <View style={styles.arrowButtons}>
                  <Pressable
                    onPress={() => moveUp(index)}
                    disabled={index === 0}
                    style={[styles.arrowButton, index === 0 && styles.arrowButtonDisabled]}
                    testID={`reorder-up-${item.name}`}
                  >
                    <Text style={styles.arrowText}>{strings.channels.moveUpAction}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => moveDown(index)}
                    disabled={index === items.length - 1}
                    style={[
                      styles.arrowButton,
                      index === items.length - 1 && styles.arrowButtonDisabled,
                    ]}
                    testID={`reorder-down-${item.name}`}
                  >
                    <Text style={styles.arrowText}>{strings.channels.moveDownAction}</Text>
                  </Pressable>
                </View>
              </View>
            )}
          />

          <View style={styles.actionRow}>
            <Pressable style={styles.cancelButton} onPress={onClose} testID="reorder-cancel">
              <Text style={styles.cancelText}>{strings.common.cancel}</Text>
            </Pressable>
            <Pressable
              style={[styles.saveButton, reorder.isPending && styles.saveButtonDisabled]}
              onPress={handleSave}
              disabled={reorder.isPending}
              testID="reorder-save"
            >
              <Text style={styles.saveText}>{strings.channels.saveEdit}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: palette.bg,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    maxHeight: '90%',
  },
  title: {
    ...typography.title,
    color: palette.text,
    marginBottom: spacing.xs,
  },
  hint: {
    ...typography.caption,
    color: palette.textMuted,
    marginBottom: spacing.md,
  },
  list: {
    maxHeight: 400,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    backgroundColor: palette.bgElevated,
    borderRadius: 8,
    marginBottom: spacing.xs,
  },
  channelLabel: {
    ...typography.body,
    color: palette.text,
    flex: 1,
  },
  arrowButtons: {
    flexDirection: 'column',
    gap: 2,
  },
  arrowButton: {
    padding: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  arrowButtonDisabled: {
    opacity: 0.3,
  },
  arrowText: {
    ...typography.caption,
    color: palette.accent,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
  },
  cancelButton: {
    padding: spacing.md,
  },
  cancelText: {
    ...typography.body,
    color: palette.textMuted,
  },
  saveButton: {
    padding: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: palette.accent,
    borderRadius: 8,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveText: {
    ...typography.body,
    color: palette.text,
    fontWeight: '600',
  },
});
