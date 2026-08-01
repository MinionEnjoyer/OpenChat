import { memo, useLayoutEffect, useRef } from 'react';
import type { Message } from '../lib/types';
import { MessageRow } from './MessageRow';
import { OpenChatSpinner } from './OpenChatSpinner';

export interface MessageListProps {
  messages: Message[];
  channelId: string | null;
  resumeMessageId?: string | null;
  hasMore: boolean;
  hasNewer: boolean;
  loadingOlder: boolean;
  loadingNewer: boolean;
  onLoadOlder: () => void;
  onLoadNewer: () => void;
  onReadPosition: (channelId: string, messageId: string) => void;
  meId: string;
  myUsername: string;
  shareBaseUrl: string;
  mentionNames: Set<string>;
  canDeleteAny: boolean;
  canPin: boolean;
  editingId: string | null;
  onToggleReaction: (messageId: string, emoji: string, mine: boolean) => void;
  onReply: (m: Message) => void;
  onStartEdit: (m: Message) => void;
  onSaveEdit: (messageId: string, content: string) => void;
  onCancelEdit: () => void;
  onPin: (m: Message, pinned: boolean) => void;
  onDelete: (channelId: string, id: string) => void;
  onPollVote: (optionId: string) => void;
  onOpenReactionPicker: (messageId: string, anchor: { x: number; y: number }) => void;
}

/** The scrollable message list. Memoized so it repaints only when its own inputs
 *  change — not on every presence/typing/unread event flowing through the store. */
function MessageListInner(props: MessageListProps) {
  const {
    messages, meId, canDeleteAny, editingId, channelId, resumeMessageId,
    hasMore, hasNewer, loadingOlder, loadingNewer, onLoadOlder, onLoadNewer,
  } = props;
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevScrollHeight = useRef<number | null>(null); // set right before older messages prepend
  const holdOnAppend = useRef(false);
  const prevChannel = useRef<string | null>(null);
  const restoredChannel = useRef<string | null>(null);
  const lastReported = useRef<{ channelId: string; messageId: string } | null>(null);
  const wasLoadingNewer = useRef(false);
  const nearBottom = useRef(true);

  function reportVisibleReadPosition() {
    const el = scrollRef.current;
    if (!el || !channelId) return;
    const viewport = el.getBoundingClientRect();
    const rows = el.querySelectorAll<HTMLElement>('[data-message-id]');
    let visibleId: string | null = null;
    for (const row of rows) {
      const rect = row.getBoundingClientRect();
      if (rect.top < viewport.bottom - 8 && rect.bottom > viewport.top + 8) {
        visibleId = row.dataset.messageId || null;
      }
    }
    if (!visibleId) return;
    if (lastReported.current?.channelId === channelId && lastReported.current.messageId === visibleId) return;
    lastReported.current = { channelId, messageId: visibleId };
    props.onReadPosition(channelId, visibleId);
  }

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (el.scrollTop < 120 && hasMore && !loadingOlder) {
      prevScrollHeight.current = el.scrollHeight;
      onLoadOlder();
    } else if (nearBottom.current && hasNewer && !loadingNewer) {
      holdOnAppend.current = true;
      onLoadNewer();
    }
    reportVisibleReadPosition();
  }

  // Restore the shared last-read marker at the lower edge (so opening a channel does
  // not silently advance it), hold position when either history direction is loaded,
  // and follow live messages only when already at the newest edge.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const newerRequestFinished = wasLoadingNewer.current && !loadingNewer;
    wasLoadingNewer.current = loadingNewer;
    if (prevChannel.current !== channelId) {
      prevChannel.current = channelId;
      restoredChannel.current = null;
      lastReported.current = null;
    }
    if (restoredChannel.current !== channelId) {
      // undefined means the read-state request is still in flight. null means there
      // is no marker and the normal newest-message position should be used.
      if (resumeMessageId === undefined) return;
      const target = resumeMessageId
        ? el.querySelector<HTMLElement>(`[data-message-id="${resumeMessageId}"]`)
        : null;
      if (target) {
        const viewport = el.getBoundingClientRect();
        const rect = target.getBoundingClientRect();
        el.scrollTop += rect.bottom - viewport.bottom + 16;
        nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
      } else {
        nearBottom.current = true;
        el.scrollTop = el.scrollHeight;
      }
      restoredChannel.current = channelId;
      requestAnimationFrame(reportVisibleReadPosition);
      return;
    }
    if (prevScrollHeight.current != null) {
      el.scrollTop += el.scrollHeight - prevScrollHeight.current;
      prevScrollHeight.current = null;
      return;
    }
    if (holdOnAppend.current && newerRequestFinished) {
      holdOnAppend.current = false;
      nearBottom.current = false;
      return;
    }
    if (nearBottom.current) el.scrollTop = el.scrollHeight;
    requestAnimationFrame(reportVisibleReadPosition);
  }, [messages, channelId, resumeMessageId, loadingNewer]);

  return (
    <div ref={scrollRef} onScroll={onScroll} className="msg-scroll" style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {loadingOlder && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--muted-2)', fontSize: 12, padding: 4 }}>
          <OpenChatSpinner size={22} label="Loading older messages" />
          Loading older messages…
        </div>
      )}
      {messages.length === 0 && <div style={{ color: 'var(--muted-2)', fontStyle: 'italic' }}>No messages yet.</div>}
      {messages.map((m) => (
        <MessageRow
          key={m.id}
          message={m}
          meId={meId}
          myUsername={props.myUsername}
          shareBaseUrl={props.shareBaseUrl}
          mentionNames={props.mentionNames}
          isEditing={editingId === m.id}
          canDelete={m.authorId === meId || canDeleteAny}
          canPin={props.canPin}
          onToggleReaction={props.onToggleReaction}
          onReply={props.onReply}
          onStartEdit={props.onStartEdit}
          onSaveEdit={props.onSaveEdit}
          onCancelEdit={props.onCancelEdit}
          onPin={props.onPin}
          onDelete={props.onDelete}
          onPollVote={props.onPollVote}
          onOpenReactionPicker={props.onOpenReactionPicker}
        />
      ))}
      {loadingNewer && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--muted-2)', fontSize: 12, padding: 4 }}>
          <OpenChatSpinner size={22} label="Loading newer messages" />
          Loading newer messages…
        </div>
      )}
    </div>
  );
}

export const MessageList = memo(MessageListInner);
