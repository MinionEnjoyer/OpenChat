import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { palette, spacing, typography } from '../../ui/tokens';
import { strings } from '../../ui/strings';
import { showToast } from '../../ui/Toast';
import { api, useSession } from '../../stores/session';
import { gateway } from '../../realtime';
import {
  addPending, applyCreated, applyUpdated, makePending, messageKeys, removePending, type PendingMessage,
} from '../../sync/messages';
import { optimisticToggle } from '../../domain/reactions';
import { ReactionPills } from './ReactionPills';
import { EmojiPicker } from './EmojiPicker';
import { ReactorListSheet } from './ReactorListSheet';
import type { Message } from '../../api/schema';

/**
 * P2 messaging core inside the shell's chat pane: newest-anchored list (FR-MSG-001 core),
 * optimistic send (FR-MSG-002), and reactions (FR-MSG-006).
 */
export function ChatPane({ channelId }: { channelId: string }): React.JSX.Element {
  const user = useSession((s) => s.user);
  const [draft, setDraft] = useState('');
  const nonceCounter = useRef(0);

  // Reactions state
  const [pickerTargetId, setPickerTargetId] = useState<string | null>(null);
  const [reactorEmoji, setReactorEmoji] = useState<string | null>(null);

  useEffect(() => {
    gateway.subscribe(channelId);
    return () => gateway.unsubscribe(channelId);
  }, [channelId]);

  const messages = useQuery({
    queryKey: messageKeys.list(channelId),
    queryFn: () => api.request<Message[]>(`/channels/${channelId}/messages?limit=50`),
  });

  const send = async (content: string): Promise<void> => {
    if (!content.trim() || !user) return;
    const nonce = `${user.id.slice(0, 8)}-${Date.now()}-${nonceCounter.current++}`;
    addPending(makePending({ channelId, content, nonce, authorId: user.id }));
    setDraft('');
    try {
      const created = await api.request<Message>(`/channels/${channelId}/messages`, {
        method: 'POST',
        body: { content, nonce },
      });
      applyCreated({ ...created, nonce: created.nonce ?? nonce });
    } catch {
      removePending(channelId, nonce);
      showToast(strings.messages.sendFailed, () => void send(content));
    }
  };

  const toggleReaction = useCallback(
    async (messageId: string, emoji: string, active: boolean) => {
      if (!user) return;
      // Optimistic update
      applyUpdated({
        id: messageId,
        channelId,
        reactions: optimisticToggle(
          (messages.data as PendingMessage[])?.find((m) => m.id === messageId)?.reactions ?? [],
          user.id,
          emoji,
          active ? 'remove' : 'add',
        ),
        editedAt: null,
      } as PendingMessage);
      try {
        if (active) {
          await api.request(`/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`, { method: 'DELETE' });
        } else {
          await api.request(`/messages/${messageId}/reactions`, { method: 'POST', body: { emoji } });
        }
        // The server will publish message.updated which replaces the optimistic copy.
      } catch {
        // Revert by re-fetching — the server ack (or lack thereof) will correct
        void messages.refetch();
      }
    },
    [user, channelId, messages],
  );

  const handlePickerSelect = useCallback(
    (emoji: string) => {
      const msgId = pickerTargetId;
      setPickerTargetId(null);
      if (!msgId || !user) return;
      const msg = (messages.data as PendingMessage[] | undefined)?.find((m) => m.id === msgId);
      const active = msg ? msg.reactions.some((r) => r.emoji === emoji && r.userIds.includes(user.id)) : false;
      void toggleReaction(msgId, emoji, active);
    },
    [pickerTargetId, user, messages.data, toggleReaction],
  );

  return (
    <View style={styles.root} testID="chat-messages">
      <FlatList
        inverted
        data={messages.data as PendingMessage[] | undefined}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => (
          <Pressable
            style={[styles.row, item.pending && styles.rowPending]}
            onLongPress={() => setPickerTargetId(item.id)}
            delayLongPress={400}
          >
            <Text style={styles.author}>
              {item.authorId === user?.id
                ? (user?.displayName ?? user?.username ?? '')
                : item.authorId.slice(0, 8)}
            </Text>
            <Text style={styles.content}>{item.content}</Text>
            {user && (
              <ReactionPills
                reactions={item.reactions}
                userId={user.id}
                onToggleReaction={(emoji, active) => void toggleReaction(item.id, emoji, active)}
                onShowReactors={setReactorEmoji}
              />
            )}
          </Pressable>
        )}
        ListEmptyComponent={
          <Text style={styles.empty} testID="chat-empty">
            {strings.messages.empty}
          </Text>
        }
      />
      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          placeholder={strings.messages.composerPlaceholder}
          placeholderTextColor={palette.textMuted}
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={() => void send(draft)}
          accessibilityLabel={strings.messages.composerPlaceholder}
          testID="composer-input"
        />
        <Pressable
          style={styles.send}
          onPress={() => void send(draft)}
          accessibilityLabel={strings.messages.send}
          testID="composer-send"
        >
          <Text style={styles.sendText}>{strings.messages.send}</Text>
        </Pressable>
      </View>

      <EmojiPicker
        visible={pickerTargetId !== null}
        onSelect={handlePickerSelect}
        onClose={() => setPickerTargetId(null)}
      />

      <ReactorListSheet
        visible={reactorEmoji !== null}
        emoji={reactorEmoji ?? ''}
        reactions={reactorEmoji ? (messages.data as PendingMessage[] | undefined)?.find(
          (m) => m.reactions.some((r) => r.emoji === reactorEmoji),
        )?.reactions ?? [] : []}
        onClose={() => setReactorEmoji(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  row: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  rowPending: { opacity: 0.5 },
  author: { ...typography.caption, color: palette.accent, fontWeight: '700' },
  content: { ...typography.body, color: palette.text },
  empty: { ...typography.caption, color: palette.textMuted, textAlign: 'center', padding: spacing.lg },
  composer: {
    flexDirection: 'row', padding: spacing.sm, borderTopWidth: 1, borderTopColor: palette.bgElevated,
  },
  input: {
    ...typography.body, flex: 1, backgroundColor: palette.bgElevated, color: palette.text,
    borderRadius: 8, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginRight: spacing.sm,
  },
  send: { backgroundColor: palette.accent, borderRadius: 8, paddingHorizontal: spacing.md, justifyContent: 'center' },
  sendText: { ...typography.body, color: palette.text, fontWeight: '700' },
});
