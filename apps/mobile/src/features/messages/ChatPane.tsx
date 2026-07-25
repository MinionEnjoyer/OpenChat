import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { palette, spacing, typography } from '../../ui/tokens';
import { strings } from '../../ui/strings';
import { showToast } from '../../ui/Toast';
import { api, useSession } from '../../stores/session';
import { gateway } from '../../realtime';
import {
  addPending, applyCreated, applyUpdated, applyDeleted,
  makePending, messageKeys, removePending, type PendingMessage,
} from '../../sync/messages';
import { optimisticToggle } from '../../domain/reactions';
import { ReactionPills } from './ReactionPills';
import { EmojiPicker } from './EmojiPicker';
import { ReactorListSheet } from './ReactorListSheet';
import { resolveAuthorName } from '../../domain/authors';
import { queryClient } from '../../sync/queryClient';
import { keys } from '../../sync/keys';
import { useTyping } from '../../stores/typing';
import { formatTyping } from '../../domain/typing';
import type { Message, Server } from '../../api/schema';
import { Permission } from '../../api/schema';
import { usePaginatedMessages } from './usePaginatedMessages';
import { insertDayDividers, computeAuthorGroups, type MessageOrDivider } from '../../domain/pagination';

function hasManageMessages(serverId: string | null): boolean {
  if (!serverId) return false;
  const servers = queryClient.getQueryData<Server[]>(keys.servers);
  const server = servers?.find((s) => s.id === serverId);
  if (!server) return false;
  try {
    return (BigInt(server.myPermissions) & Permission.MANAGE_MESSAGES) !== 0n;
  } catch {
    return false;
  }
}

/**
 * P2 messaging core inside the shell's chat pane: newest-anchored list
 * (FR-MSG-001 core; day dividers/pagination land next), optimistic send with
 * nonce reconciliation via the gateway (FR-MSG-002), failed sends toast with
 * retry (FR-APP-006), edit (FR-MSG-003), delete (FR-MSG-004),
 * and reactions (FR-MSG-006).
 */
export function ChatPane({ channelId, serverId }: {
  channelId: string;
  serverId: string | null;
}): React.JSX.Element {
  const user = useSession((s) => s.user);
  const [draft, setDraft] = useState('');
  const nonceCounter = useRef(0);

  // Reactions state
  const [pickerTargetId, setPickerTargetId] = useState<string | null>(null);
  const [reactorEmoji, setReactorEmoji] = useState<string | null>(null);

  // Edit state
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [editDraft, setEditDraft] = useState('');

  const canManage = hasManageMessages(serverId);

  // ── Typing indicators (FR-MSG-009) ──────────────────────────────────
  // Re-render when the typist count for this channel changes.
  const typingCount = useTyping(
    (s) => Object.keys(s.typists[channelId] ?? {}).length,
  );
  const activeTypistIds = useMemo(() => {
    void typingCount; // trigger recomputation when typist set changes
    if (!user) return [];
    return useTyping.getState().getActiveTypistIds(channelId, user.id);
  }, [typingCount, channelId, user]);

  // Resolve typist userIds → display names from the message cache.
  const typistNames = useMemo(() => {
    const cache = queryClient.getQueryData<PendingMessage[]>(messageKeys.list(channelId));
    return activeTypistIds.map((uid) => {
      const msg = cache?.find((m) => m.authorId === uid);
      return msg?.authorId ? `@${msg.authorId.slice(0, 8)}` : `@${uid.slice(0, 8)}`;
    });
  }, [activeTypistIds, channelId]);

  const typingText = useMemo(
    () => formatTyping(typistNames, strings.typing),
    [typistNames],
  );

  /** Outbound throttle: send typing.start at most once per 3s per channel. */
  const onComposerChange = useCallback((text: string) => {
    setDraft(text);
    if (text.length > 0 && useTyping.getState().shouldSendTyping(channelId)) {
      useTyping.getState().markSent(channelId);
      gateway.send('typing.start', { channelId });
    }
  }, [channelId]);

  useEffect(() => {
    gateway.subscribe(channelId);
    return () => gateway.unsubscribe(channelId);
  }, [channelId]);

  const { messages: rawMessages, fetchOlder } = usePaginatedMessages(channelId, 50);

  // ── Enhanced list: day dividers + author grouping (FR-MSG-001) ──────
  const enhancedMessages = useMemo((): MessageOrDivider[] | undefined => {
    if (!rawMessages) return undefined;
    return insertDayDividers(rawMessages);
  }, [rawMessages]);

  const authorGroups = useMemo((): boolean[] | undefined => {
    if (!rawMessages) return undefined;
    return computeAuthorGroups(rawMessages);
  }, [rawMessages]);

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
      applyUpdated({
        id: messageId,
        channelId,
        reactions: optimisticToggle(
          rawMessages?.find((m) => m.id === messageId)?.reactions ?? [],
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
      } catch {
        // Refetch is not directly available in paginated mode; the next
        // scroll-driven fetchOlder will reconcile. For now, no-op.
      }
    },
    [user, channelId, rawMessages],
  );

  const handlePickerSelect = useCallback(
    (emoji: string) => {
      const msgId = pickerTargetId;
      setPickerTargetId(null);
      if (!msgId || !user) return;
      const msg = rawMessages?.find((m) => m.id === msgId);
      const active = msg ? msg.reactions.some((r) => r.emoji === emoji && r.userIds.includes(user.id)) : false;
      void toggleReaction(msgId, emoji, active);
    },
    [pickerTargetId, user, rawMessages, toggleReaction],
  );

  // ── Edit ──────────────────────────────────────────────────────────

  const openEdit = useCallback((msg: Message) => {
    setEditingMessage(msg);
    setEditDraft(msg.content);
  }, []);

  const closeEdit = useCallback(() => {
    setEditingMessage(null);
    setEditDraft('');
  }, []);

  const doEdit = useCallback(async () => {
    if (!editingMessage || !editDraft.trim()) return;
    const prevContent = editingMessage.content;
    const optimistic = { ...editingMessage, content: editDraft.trim(), editedAt: new Date().toISOString() };
    applyUpdated(optimistic);
    closeEdit();
    try {
      const updated = await api.request<Message>(`/messages/${editingMessage.id}`, {
        method: 'PATCH',
        body: { content: editDraft.trim() },
      });
      applyUpdated(updated);
    } catch {
      applyUpdated({ ...editingMessage, content: prevContent });
      showToast(strings.messages.editFailed);
    }
  }, [editingMessage, editDraft, closeEdit]);

  // ── Delete ────────────────────────────────────────────────────────

  const doDelete = useCallback(async (msg: Message) => {
    applyDeleted(msg.channelId, msg.id);
    try {
      await api.request(`/messages/${msg.id}`, { method: 'DELETE' });
    } catch {
      applyUpdated(msg);
      showToast(strings.messages.deleteFailed);
    }
  }, []);

  const confirmDelete = useCallback((msg: Message) => {
    Alert.alert(strings.messages.deleteConfirm, undefined, [
      { text: strings.common.cancel, style: 'cancel' },
      {
        text: strings.messages.deleteConfirmOk,
        style: 'destructive',
        onPress: () => void doDelete(msg),
      },
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage, doDelete]);

  // ── Pin / Unpin (FR-MSG-011) ──────────────────────────────────────

  const doPin = useCallback(async (msg: Message, pinned: boolean) => {
    const optimistic = { ...msg, pinned };
    applyUpdated(optimistic as PendingMessage);
    try {
      const updated = await api.request<Message>(`/messages/${msg.id}/pin`, {
        method: 'PATCH',
        body: { pinned },
      });
      applyUpdated(updated);
    } catch {
      applyUpdated(msg as PendingMessage);
      showToast(strings.messages.pinFailed);
    }
  }, []);

  // ── Copy ──────────────────────────────────────────────────────────

  const copyText = useCallback(async (content: string) => {
    await Clipboard.setStringAsync(content);
  }, []);

  // ── Long-press action sheet ───────────────────────────────────────

  const showActions = useCallback((msg: PendingMessage) => {
    if (msg.pending || msg.deletedAt) return;
    const isOwn = msg.authorId === user?.id;
    const canDelete = isOwn || canManage;

    const buttons: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [];

    if (isOwn) {
      buttons.push({ text: strings.messages.edit, onPress: () => openEdit(msg) });
    }
    buttons.push({ text: strings.messages.react, onPress: () => setPickerTargetId(msg.id) });
    if (canManage) {
      buttons.push({
        text: msg.pinned ? strings.messages.unpin : strings.messages.pin,
        onPress: () => void doPin(msg, !msg.pinned),
      });
    }
    if (canDelete) {
      buttons.push({ text: strings.messages.delete, style: 'destructive', onPress: () => confirmDelete(msg) });
    }
    buttons.push({ text: strings.messages.copyText, onPress: () => void copyText(msg.content) });
    buttons.push({ text: strings.common.cancel, style: 'cancel' });

    Alert.alert('', '', buttons);
  }, [user?.id, canManage, openEdit, confirmDelete, copyText, doPin]);

  // ── Render ────────────────────────────────────────────────────────

  return (
    <View style={styles.root} testID="chat-messages">
      <FlatList
        inverted
        data={enhancedMessages}
        keyExtractor={(item, index) => 'kind' in item ? `div-${item.date}` : item.id}
        onEndReached={() => fetchOlder()}
        onEndReachedThreshold={0.5}
        renderItem={({ item, index }) => {
          // Day divider
          if ('kind' in item && item.kind === 'day-divider') {
            return (
              <View style={styles.dayDivider}>
                <Text style={styles.dayDividerText}>{item.date}</Text>
              </View>
            );
          }
          // Regular message
          const msg = item as PendingMessage;
          const showAuthor = authorGroups
            ? (authorGroups[rawMessages!.indexOf(msg)] ?? true)
            : true;

          if (msg.deletedAt) {
            return (
              <View style={[styles.row, styles.rowDeleted]}>
                <Text style={styles.deletedText}>{strings.messages.deleted}</Text>
              </View>
            );
          }
          return (
            <Pressable
              style={[styles.row, msg.pending && styles.rowPending]}
              onLongPress={() => showActions(msg)}
              delayLongPress={400}
              testID={`message-${msg.id}`}
            >
              {showAuthor && (
                <View style={styles.header}>
                  <Text style={styles.author}>
                    {resolveAuthorName(
                      msg.authorId,
                      msg.author,
                      user?.id,
                      user?.displayName,
                      user?.username,
                    )}
                  </Text>
                  {msg.editedAt && (
                    <Text style={styles.edited}>{strings.messages.edited}</Text>
                  )}
                  {msg.pinned && (
                    <Text style={styles.pinned} testID={`pinned-${msg.id}`}>{strings.messages.pinIcon}</Text>
                  )}
                </View>
              )}
              <Text style={styles.content}>{msg.content}</Text>
              {user && (
                <ReactionPills
                  reactions={msg.reactions}
                  userId={user.id}
                  onToggleReaction={(emoji, active) => void toggleReaction(msg.id, emoji, active)}
                  onShowReactors={setReactorEmoji}
                />
              )}
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <Text style={styles.empty} testID="chat-empty">
            {strings.messages.empty}
          </Text>
        }
      />
      {typingText !== '' && (
        <Text style={styles.typing} testID="typing-indicator">
          {typingText}
        </Text>
      )}
      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          placeholder={strings.messages.composerPlaceholder}
          placeholderTextColor={palette.textMuted}
          value={draft}
          onChangeText={onComposerChange}
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
        reactions={reactorEmoji ? rawMessages?.find(
          (m) => m.reactions.some((r) => r.emoji === reactorEmoji),
        )?.reactions ?? [] : []}
        onClose={() => setReactorEmoji(null)}
      />

      {/* ── Edit modal ──────────────────────────────────────────────── */}
      <Modal
        visible={editingMessage !== null}
        transparent
        animationType="fade"
        onRequestClose={closeEdit}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{strings.messages.editTitle}</Text>
            <TextInput
              style={styles.editInput}
              value={editDraft}
              onChangeText={setEditDraft}
              multiline
              autoFocus
              accessibilityLabel={strings.messages.editTitle}
            />
            <View style={styles.modalButtons}>
              <Pressable style={styles.modalBtn} onPress={closeEdit}>
                <Text style={styles.modalBtnText}>{strings.messages.editCancel}</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnPrimary]}
                onPress={() => void doEdit()}
              >
                <Text style={styles.modalBtnPrimaryText}>{strings.messages.editSave}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  row: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  rowPending: { opacity: 0.5 },
  rowDeleted: { opacity: 0.4 },
  dayDivider: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, alignItems: 'center' as const },
  dayDividerText: { ...typography.caption, color: palette.textMuted },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  author: { ...typography.caption, color: palette.accent, fontWeight: '700' },
  edited: { ...typography.caption, color: palette.textMuted, fontSize: 10 },
  pinned: { fontSize: 12 },
  content: { ...typography.body, color: palette.text },
  deletedText: { ...typography.caption, color: palette.textMuted, fontStyle: 'italic' },
  empty: { ...typography.caption, color: palette.textMuted, textAlign: 'center', padding: spacing.lg },
  typing: { ...typography.caption, color: palette.textMuted, paddingHorizontal: spacing.md, paddingBottom: spacing.xs },
  composer: {
    flexDirection: 'row', padding: spacing.sm, borderTopWidth: 1, borderTopColor: palette.bgElevated,
  },
  input: {
    ...typography.body, flex: 1, backgroundColor: palette.bgElevated, color: palette.text,
    borderRadius: 8, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginRight: spacing.sm,
  },
  send: { backgroundColor: palette.accent, borderRadius: 8, paddingHorizontal: spacing.md, justifyContent: 'center' },
  sendText: { ...typography.body, color: palette.text, fontWeight: '700' },
  // Edit modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: spacing.lg,
  },
  modalContent: {
    backgroundColor: palette.bg, borderRadius: 12, padding: spacing.lg,
  },
  modalTitle: { ...typography.body, color: palette.text, fontWeight: '700', marginBottom: spacing.md },
  editInput: {
    ...typography.body, backgroundColor: palette.bgElevated, color: palette.text,
    borderRadius: 8, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    minHeight: 80, textAlignVertical: 'top', marginBottom: spacing.md,
  },
  modalButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm },
  modalBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 8 },
  modalBtnPrimary: { backgroundColor: palette.accent },
  modalBtnText: { ...typography.body, color: palette.textMuted },
  modalBtnPrimaryText: { ...typography.body, color: palette.text, fontWeight: '700' },
});
