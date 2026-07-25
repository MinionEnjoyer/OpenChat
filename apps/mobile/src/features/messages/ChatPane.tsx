import { useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { palette, spacing, typography } from '../../ui/tokens';
import { strings } from '../../ui/strings';
import { showToast } from '../../ui/Toast';
import { api, useSession } from '../../stores/session';
import { gateway } from '../../realtime';
import {
  addPending, applyCreated, makePending, messageKeys, removePending, type PendingMessage,
} from '../../sync/messages';
import type { Message } from '../../api/schema';

/**
 * P2 messaging core inside the shell's chat pane: newest-anchored list
 * (FR-MSG-001 core; day dividers/pagination land next), optimistic send with
 * nonce reconciliation via the gateway (FR-MSG-002), failed sends toast with
 * retry (FR-APP-006).
 */
export function ChatPane({ channelId }: { channelId: string }): React.JSX.Element {
  const user = useSession((s) => s.user);
  const [draft, setDraft] = useState('');
  const nonceCounter = useRef(0);

  // Live events for the visible channel (E2: events only for subscribed channels).
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
      // The REST ack may echo nonce as null; stamp ours on so the merge always
      // replaces the pending copy instead of prepending a duplicate.
      applyCreated({ ...created, nonce: created.nonce ?? nonce });
    } catch {
      removePending(channelId, nonce);
      showToast(strings.messages.sendFailed, () => void send(content));
    }
  };

  return (
    <View style={styles.root} testID="chat-messages">
      <FlatList
        inverted
        data={messages.data as PendingMessage[] | undefined}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => (
          <View style={[styles.row, item.pending && styles.rowPending]}>
            <Text style={styles.author}>{item.authorId === user?.id ? (user?.displayName ?? user?.username ?? '') : item.authorId.slice(0, 8)}</Text>
            <Text style={styles.content}>{item.content}</Text>
          </View>
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
