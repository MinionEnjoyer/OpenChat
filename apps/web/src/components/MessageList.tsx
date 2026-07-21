import { memo, useLayoutEffect, useRef } from 'react';
import type { Message } from '../lib/types';
import { MessageRow } from './MessageRow';

export interface MessageListProps {
  messages: Message[];
  channelId: string | null;
  hasMore: boolean;
  loadingOlder: boolean;
  onLoadOlder: () => void;
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
  const { messages, meId, canDeleteAny, editingId, channelId, hasMore, loadingOlder, onLoadOlder } = props;
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevScrollHeight = useRef<number | null>(null); // set right before older messages prepend
  const prevChannel = useRef<string | null>(null);
  const nearBottom = useRef(true);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (el.scrollTop < 120 && hasMore && !loadingOlder) {
      prevScrollHeight.current = el.scrollHeight;
      onLoadOlder();
    }
  }

  // Keep the viewport sensible: jump to newest on channel open, hold position when
  // older history is prepended, and follow new messages only when already at the bottom.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (prevChannel.current !== channelId) {
      prevChannel.current = channelId;
      nearBottom.current = true;
      el.scrollTop = el.scrollHeight;
      return;
    }
    if (prevScrollHeight.current != null) {
      el.scrollTop += el.scrollHeight - prevScrollHeight.current;
      prevScrollHeight.current = null;
      return;
    }
    if (nearBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages, channelId]);

  return (
    <div ref={scrollRef} onScroll={onScroll} className="msg-scroll" style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {loadingOlder && <div style={{ textAlign: 'center', color: 'var(--muted-2)', fontSize: 12, padding: 4 }}>Loading older messages…</div>}
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
    </div>
  );
}

export const MessageList = memo(MessageListInner);
