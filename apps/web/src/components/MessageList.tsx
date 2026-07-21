import { memo } from 'react';
import type { Message } from '../lib/types';
import { MessageRow } from './MessageRow';

export interface MessageListProps {
  messages: Message[];
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
  const { messages, meId, canDeleteAny, editingId } = props;
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
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
