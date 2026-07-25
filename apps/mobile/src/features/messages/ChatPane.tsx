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
import { PollCard } from './PollCard';
import { PollCreate } from './PollCreate';
import { voteAction, optimisticVote } from '../../domain/polls';
import { ReactorListSheet } from './ReactorListSheet';
import { MessageEmbeds } from './MessageEmbeds';
import { GifPicker } from './GifPicker';
import type { GifResult } from './GifPicker';
import { AttachmentGrid } from '../attachments';
import { useGifFeature } from './gifFeature';
import { useServerConfig } from './serverConfig';
import { classifyEmbeds, isSingleEmbedUrl } from '../../domain/embeds';
import { resolveAuthorName } from '../../domain/authors';
import { queryClient } from '../../sync/queryClient';
import { keys } from '../../sync/keys';
import { useTyping } from '../../stores/typing';
import { formatTyping } from '../../domain/typing';
import { buildMessageLink } from '../../domain/links';
import type { Message, Server } from '../../api/schema';
import { Permission } from '../../api/schema';
import {
  buildMentionCandidates,
  detectMentionTrigger,
  filterMentionCandidates,
  insertMention,
  parseMentionSegments,
  canMentionEveryone,
  buildMemberUsernameSet,
  type MentionCandidate,
  type MemberBrief,
} from '../../domain/mentions';
import { usePaginatedMessages } from './usePaginatedMessages';
import { insertDayDividers, computeAuthorGroups, type MessageOrDivider } from '../../domain/pagination';
import { resolveReplyPreview } from '../../domain/reply';

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
 * reactions (FR-MSG-006), and mentions (FR-MSG-008).
 */
export function ChatPane({ channelId, serverId, members, myPermissions, serverOwnerId }: {
  channelId: string;
  serverId: string | null;
  members?: MemberBrief[];
  myPermissions?: string;
  serverOwnerId?: string;
}): React.JSX.Element {
  const user = useSession((s) => s.user);
  const [draft, setDraft] = useState('');
  const nonceCounter = useRef(0);
  // FR-MSG-002: synchronous send guard — prevents double-send when both
  // onSubmitEditing (keyboard Return) and onPress (Send button) fire in
  // the same event-loop tick for a single user action.
  const sendingRef = useRef(false);

  // Reactions state
  const [pickerTargetId, setPickerTargetId] = useState<string | null>(null);
  const [reactorEmoji, setReactorEmoji] = useState<string | null>(null);

  // Edit state
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [editDraft, setEditDraft] = useState('');

  // GIF picker state (FR-MSG-014)
  const [gifPickerVisible, setGifPickerVisible] = useState(false);

  // Server config + GIF feature flag
  const shareBaseUrl = useServerConfig((s) => s.shareBaseUrl);
  const shareHost = useMemo(() => {
    if (!shareBaseUrl) return '';
    try { return new URL(shareBaseUrl).hostname; } catch { return ''; }
  }, [shareBaseUrl]);
  const gifEnabled = useGifFeature((s) => s.enabled);

  // Trigger config fetch + GIF probe once
  useEffect(() => {
    void useServerConfig.getState().fetch();
    void useGifFeature.getState().probe();
  }, []);
  // Poll state
  const [showPollCreate, setShowPollCreate] = useState(false);
  // Reply state (FR-MSG-005)
  const [replyTarget, setReplyTarget] = useState<Message | null>(null);
  const flatListRef = useRef<FlatList<MessageOrDivider>>(null);

  const canManage = hasManageMessages(serverId);

  // ── Mentions (FR-MSG-008) ──────────────────────────────────────────

  const mentionEveryone = useMemo(
    () => canMentionEveryone(myPermissions, user?.id === serverOwnerId),
    [myPermissions, serverOwnerId, user?.id],
  );

  const mentionCandidates: MentionCandidate[] = useMemo(
    () => buildMentionCandidates(members, mentionEveryone),
    [members, mentionEveryone],
  );

  const memberUsernameSet = useMemo(
    () => buildMemberUsernameSet(members),
    [members],
  );

  const [mentionTrigger, setMentionTrigger] = useState<{
    query: string;
    start: number;
  } | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);

  const mentionMatches: MentionCandidate[] = useMemo(
    () => (mentionTrigger
      ? filterMentionCandidates(mentionCandidates, mentionTrigger.query)
      : []),
    [mentionTrigger, mentionCandidates],
  );

  /** Update mention trigger state when composer text changes. */
  const updateMention = useCallback(
    (value: string, cursor: number) => {
      const detected = detectMentionTrigger(value, cursor, mentionCandidates.length > 0);
      if (detected) {
        setMentionTrigger(detected);
        setMentionIndex(0);
      } else {
        setMentionTrigger(null);
      }
    },
    [mentionCandidates.length],
  );

  /** Insert a selected mention candidate into the draft. */
  const insertMentionCandidate = useCallback(
    (c: MentionCandidate) => {
      if (!mentionTrigger) return;
      setDraft((prev) =>
        insertMention(prev, mentionTrigger.start, mentionTrigger.query, c.username),
      );
      setMentionTrigger(null);
    },
    [mentionTrigger],
  );

  // ── Typing indicators (FR-MSG-009) ──────────────────────────────────

  const typingCount = useTyping(
    (s) => Object.keys(s.typists[channelId] ?? {}).length,
  );
  const activeTypistIds = useMemo(() => {
    void typingCount;
    if (!user) return [];
    return useTyping.getState().getActiveTypistIds(channelId, user.id);
  }, [typingCount, channelId, user]);

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

  const { messages: rawMessages, fetchOlder, fetchAround } = usePaginatedMessages(channelId, 50);

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
    if (!content.trim() || !user || sendingRef.current) return;
    sendingRef.current = true;
    const replyToId = replyTarget?.id ?? null;
    const nonce = `${user.id.slice(0, 8)}-${Date.now()}-${nonceCounter.current++}`;
    addPending(makePending({ channelId, content, nonce, authorId: user.id, replyToId }));
    setDraft('');
    setReplyTarget(null);
    try {
      const created = await api.request<Message>(`/channels/${channelId}/messages`, {
        method: 'POST',
        body: { content, nonce, replyToId },
      });
      applyCreated({ ...created, nonce: created.nonce ?? nonce });
    } catch {
      removePending(channelId, nonce);
      showToast(strings.messages.sendFailed, () => void send(content));
    } finally {
      sendingRef.current = false;
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

  // Poll voting (FR-MSG-012)

  const handleVotePoll = useCallback(
    async (message: PendingMessage, optionId: string) => {
      if (!user || !message.poll) return;
      const action = voteAction(message.poll, user.id, optionId);
      if (!action.add && !action.remove) return;

      const optimisticPoll = optimisticVote(message.poll, action.add, action.remove, user.id);
      const optimistic = { ...message, poll: optimisticPoll };
      applyUpdated(optimistic as PendingMessage);

      try {
        const targetId = action.add ?? action.remove!;
        const updated = await api.request<Message>(
          `/polls/options/${targetId}/vote`,
          { method: 'POST' },
        );
        applyUpdated(updated);
      } catch {
        applyUpdated(message);
        showToast(strings.poll.voteFailed);
      }
    },
    [user],
  );

  const handlePollCreated = useCallback((msg: Message) => {
    applyCreated(msg);
    setShowPollCreate(false);
  }, []);

  // ── Copy ──────────────────────────────────────────────────────────

  const copyText = useCallback(async (content: string) => {
    await Clipboard.setStringAsync(content);
  }, []);

  const copyLink = useCallback(async (msg: PendingMessage) => {
    const link = buildMessageLink(channelId, msg.id);
    await Clipboard.setStringAsync(link);
  }, [channelId]);

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
    buttons.push({ text: strings.messages.copyLink, onPress: () => void copyLink(msg) });
    buttons.push({ text: strings.common.cancel, style: 'cancel' });

    Alert.alert('', '', buttons);
  }, [user?.id, canManage, openEdit, confirmDelete, copyText, copyLink, doPin]);

  // ── Mention-aware content rendering ───────────────────────────────

  /**
   * Render message content with highlighted mentions.
   * Parses text into segments; mention segments get styled highlight;
   * the current user's own mentions get a distinct (accent-background) style.
   */
  const renderSegmentedContent = useCallback(
    (content: string): React.ReactNode => {
      const current = user?.username?.toLowerCase();
      const segments = parseMentionSegments(content, memberUsernameSet, current);

      if (segments.length === 0) return content;

      return segments.map((seg, i) => {
        if (seg.kind === 'plain') {
          return <Text key={i}>{seg.text}</Text>;
        }
        return (
          <Text
            key={i}
            style={seg.isSelf ? styles.mentionSelf : styles.mentionHighlight}
          >
            {seg.display}
          </Text>
        );
      });
    },
    [memberUsernameSet, user?.username],
  );

  // ── Render ────────────────────────────────────────────────────────

  return (
    <View style={styles.root} testID="chat-messages">
      <FlatList
        ref={flatListRef}
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
              {/* Reply preview (FR-MSG-005) */}
              {(() => {
                if (!msg.replyToId) return null;
                const preview = resolveReplyPreview(msg, rawMessages ?? []);
                if (!preview) return null;
                return (
                  <Pressable
                    style={styles.replyPreview}
                    onPress={() => {
                      if (preview.found && rawMessages?.some((m) => m.id === preview.id)) {
                        const idx = rawMessages.findIndex((m) => m.id === preview.id);
                        if (idx >= 0 && flatListRef.current) {
                          flatListRef.current.scrollToIndex({ index: idx, animated: true });
                        }
                      } else {
                        fetchAround(preview.id);
                      }
                    }}
                    testID={`reply-preview-${msg.id}`}
                  >
                    <Text style={styles.replyPreviewAuthor} numberOfLines={1}>
                      {preview.found ? preview.authorName : strings.messages.replyNotFound}
                    </Text>
                    {preview.found && (
                      <Text style={styles.replyPreviewContent} numberOfLines={2}>
                        {preview.content}
                      </Text>
                    )}
                  </Pressable>
                );
              })()}
              {msg.poll && (
                <PollCard
                  poll={msg.poll}
                  userId={user?.id ?? ''}
                  onVote={(optionId) => void handleVotePoll(msg, optionId)}
                />
              )}
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
              {!isSingleEmbedUrl(msg.content, shareHost) && (
                <Text style={styles.content}>{renderSegmentedContent(msg.content)}</Text>
              )}
              <MessageEmbeds cards={classifyEmbeds(msg.content, shareHost)} />
              <AttachmentGrid attachments={msg.attachments} />
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

      {/* Mention autocomplete picker */}
      {mentionTrigger && mentionMatches.length > 0 && (
        <View style={styles.mentionPicker} testID="mention-picker">
          <FlatList
            data={mentionMatches}
            keyExtractor={(c) => c.id}
            renderItem={({ item: c, index }) => (
              <Pressable
                style={[
                  styles.mentionRow,
                  index === mentionIndex && styles.mentionRowActive,
                ]}
                onPress={() => insertMentionCandidate(c)}
                testID={`mention-${c.username}`}
              >
                <Text
                  style={[
                    styles.mentionRowText,
                    index === mentionIndex && styles.mentionRowTextActive,
                  ]}
                >
                  {c.id === '__everyone__'
                    ? strings.mentions.everyoneLabel
                    : c.id === '__here__'
                      ? strings.mentions.hereLabel
                      : `@${c.username}`}
                </Text>
                {c.displayName && c.id !== '__everyone__' && c.id !== '__here__' && (
                  <Text style={styles.mentionRowSub}>{c.displayName}</Text>
                )}
              </Pressable>
            )}
            style={styles.mentionList}
            keyboardShouldPersistTaps="always"
          />
        </View>
      )}

      <View style={styles.composer}>
        {replyTarget && (
          <View style={styles.replyChip}>
            <Text style={styles.replyChipText} numberOfLines={1}>
              {strings.messages.replyingTo} {resolveAuthorName(
                replyTarget.authorId,
                replyTarget.author,
                user?.id,
                user?.displayName,
                user?.username,
              )}
            </Text>
            <Pressable
              onPress={() => setReplyTarget(null)}
              accessibilityLabel={strings.messages.replyCancel}
              testID="reply-cancel"
            >
              <Text style={styles.replyChipCancel}>{strings.messages.closeIcon}</Text>
            </Pressable>
          </View>
        )}
        <TextInput
          style={styles.input}
          placeholder={strings.messages.composerPlaceholder}
          placeholderTextColor={palette.textMuted}
          value={draft}
          onChangeText={(text) => {
            onComposerChange(text);
            // We need a microtask-like read of cursor — use a ref-based approach
          }}
          onSelectionChange={(e) => {
            updateMention(draft, e.nativeEvent.selection.start);
          }}
          onKeyPress={({ nativeEvent }) => {
            if (mentionTrigger && mentionMatches.length > 0) {
              if (nativeEvent.key === 'ArrowDown') {
                setMentionIndex((i) => (i + 1) % mentionMatches.length);
                return;
              }
              if (nativeEvent.key === 'ArrowUp') {
                setMentionIndex(
                  (i) => (i - 1 + mentionMatches.length) % mentionMatches.length,
                );
                return;
              }
              if (nativeEvent.key === 'Enter' || nativeEvent.key === 'Tab') {
                insertMentionCandidate(mentionMatches[mentionIndex]!);
                return;
              }
              if (nativeEvent.key === 'Escape') {
                setMentionTrigger(null);
                return;
              }
            }
          }}
          onSubmitEditing={() => {
            if (mentionTrigger && mentionMatches.length > 0) return;
            void send(draft);
          }}
          accessibilityLabel={strings.messages.composerPlaceholder}
          testID="composer-input"
        />
        {gifEnabled === true && (
          <Pressable
            style={styles.gifBtn}
            onPress={() => setGifPickerVisible(true)}
            accessibilityLabel={strings.gifs.button}
            testID="composer-gif"
          >
            <Text style={styles.gifBtnText}>{strings.gifs.button}</Text>
          </Pressable>
        )}
        <Pressable
          style={styles.pollBtn}
          onPress={() => setShowPollCreate(true)}
          accessibilityLabel={strings.poll.createTitle}
          testID="composer-poll"
        >
          <Text style={styles.pollBtnText}>{strings.poll.chartIcon}</Text>
        </Pressable>
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

      <GifPicker
        visible={gifPickerVisible}
        onSelect={(gif: GifResult) => {
          setGifPickerVisible(false);
          void send(gif.url);
        }}
        onClose={() => setGifPickerVisible(false)}
      />

      <ReactorListSheet
        visible={reactorEmoji !== null}
        emoji={reactorEmoji ?? ''}
        reactions={reactorEmoji ? rawMessages?.find(
          (m) => m.reactions.some((r) => r.emoji === reactorEmoji),
        )?.reactions ?? [] : []}
        onClose={() => setReactorEmoji(null)}
      />

      {/* ── Poll create modal ────────────────────────────────────────── */}
      <PollCreate
        visible={showPollCreate}
        channelId={channelId}
        onClose={() => setShowPollCreate(false)}
        onCreated={handlePollCreated}
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
  // Mention rendering
  mentionHighlight: {
    backgroundColor: 'var(--hover)',
    color: palette.accent,
    borderRadius: 4,
    paddingHorizontal: 3,
    fontWeight: '600' as const,
  },
  mentionSelf: {
    backgroundColor: palette.accent,
    color: palette.text,
    borderRadius: 4,
    paddingHorizontal: 3,
    fontWeight: '600' as const,
  },
  // Mention autocomplete picker
  mentionPicker: {
    maxHeight: 200,
    backgroundColor: palette.bgElevated,
    borderTopWidth: 1,
    borderTopColor: palette.bg,
  },
  mentionList: {
    maxHeight: 200,
  },
  mentionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  mentionRowActive: {
    backgroundColor: palette.accent,
  },
  mentionRowText: {
    ...typography.body,
    color: palette.text,
    fontWeight: '600' as const,
  },
  mentionRowTextActive: {
    color: palette.text,
  },
  mentionRowSub: {
    ...typography.caption,
    color: palette.textMuted,
  },
  composer: {
    flexDirection: 'row', padding: spacing.sm, borderTopWidth: 1, borderTopColor: palette.bgElevated,
  },
  input: {
    ...typography.body, flex: 1, backgroundColor: palette.bgElevated, color: palette.text,
    borderRadius: 8, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginRight: spacing.sm,
  },
  gifBtn: { borderWidth: 1, borderColor: palette.bgElevated, borderRadius: 8, paddingHorizontal: spacing.sm, justifyContent: 'center', marginRight: spacing.sm },
  gifBtnText: { ...typography.caption, color: palette.textMuted, fontWeight: '700' },
  send: { backgroundColor: palette.accent, borderRadius: 8, paddingHorizontal: spacing.md, justifyContent: 'center' },
  sendText: { ...typography.body, color: palette.text, fontWeight: '700' },
  pollBtn: { paddingHorizontal: spacing.sm, justifyContent: 'center' },
  pollBtnText: { fontSize: 20 },
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
  // Reply preview (FR-MSG-005)
  replyPreview: {
    backgroundColor: palette.bg,
    borderLeftWidth: 3,
    borderLeftColor: palette.accent,
    borderRadius: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginBottom: spacing.xs,
  },
  replyPreviewAuthor: {
    ...typography.caption,
    color: palette.accent,
    fontWeight: '600',
  },
  replyPreviewContent: {
    ...typography.caption,
    color: palette.textMuted,
  },
  // Reply chip in composer
  replyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.bgElevated,
    borderTopWidth: 1,
    borderTopColor: palette.bg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  replyChipText: {
    ...typography.caption,
    color: palette.textMuted,
    flex: 1,
  },
  replyChipCancel: {
    ...typography.body,
    color: palette.textMuted,
    paddingLeft: spacing.sm,
  },
});

