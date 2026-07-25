import { useCallback, useEffect, useRef, useState } from 'react';
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
import { useQuery } from '@tanstack/react-query';
import { palette, spacing, typography } from '../../ui/tokens';
import { strings } from '../../ui/strings';
import { showToast } from '../../ui/Toast';
import { api, useSession } from '../../stores/session';
import { gateway } from '../../realtime';
import {
  addPending, applyCreated, applyUpdated, applyDeleted,
  makePending, messageKeys, removePending, type PendingMessage,
} from '../../sync/messages';
import { queryClient } from '../../sync/queryClient';
import { keys } from '../../sync/keys';
import type { Message, Server } from '../../api/schema';
import { Permission } from '../../api/schema';

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
 * retry (FR-APP-006), edit (FR-MSG-003) and delete (FR-MSG-004).
 */
export function ChatPane({ channelId, serverId }: {
  channelId: string;
  serverId: string | null;
}): React.JSX.Element {
  const user = useSession((s) => s.user);
  const [draft, setDraft] = useState('');
  const nonceCounter = useRef(0);

  // Edit state
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [editDraft, setEditDraft] = useState('');

  const canManage = hasManageMessages(serverId);

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
    // Optimistic update
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
      // Revert
      applyUpdated({ ...editingMessage, content: prevContent });
      showToast(strings.messages.editFailed);
    }
  }, [editingMessage, editDraft, closeEdit]);

  // ── Delete ────────────────────────────────────────────────────────

  const doDelete = useCallback(async (msg: Message) => {
    // Optimistic soft-delete
    applyDeleted(msg.channelId, msg.id);
    try {
      await api.request(`/messages/${msg.id}`, { method: 'DELETE' });
    } catch {
      // Revert
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
    if (canDelete) {
      buttons.push({ text: strings.messages.delete, style: 'destructive', onPress: () => confirmDelete(msg) });
    }
    buttons.push({ text: strings.messages.copyText, onPress: () => void copyText(msg.content) });
    buttons.push({ text: strings.common.cancel, style: 'cancel' });

    Alert.alert('', '', buttons);
  }, [user?.id, canManage, openEdit, confirmDelete, copyText]);

  // ── Render ────────────────────────────────────────────────────────

  return (
    <View style={styles.root} testID="chat-messages">
      <FlatList
        inverted
        data={messages.data as PendingMessage[] | undefined}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => {
          if (item.deletedAt) {
            return (
              <View style={[styles.row, styles.rowDeleted]}>
                <Text style={styles.deletedText}>{strings.messages.deleted}</Text>
              </View>
            );
          }
          return (
            <Pressable
              style={[styles.row, item.pending && styles.rowPending]}
              onLongPress={() => showActions(item)}
              testID={`message-${item.id}`}
            >
              <View style={styles.header}>
                <Text style={styles.author}>
                  {item.authorId === user?.id
                    ? (user?.displayName ?? user?.username ?? '')
                    : item.authorId.slice(0, 8)}
                </Text>
                {item.editedAt && (
                  <Text style={styles.edited}>{strings.messages.edited}</Text>
                )}
              </View>
              <Text style={styles.content}>{item.content}</Text>
            </Pressable>
          );
        }}
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
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  author: { ...typography.caption, color: palette.accent, fontWeight: '700' },
  edited: { ...typography.caption, color: palette.textMuted, fontSize: 10 },
  content: { ...typography.body, color: palette.text },
  deletedText: { ...typography.caption, color: palette.textMuted, fontStyle: 'italic' },
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
