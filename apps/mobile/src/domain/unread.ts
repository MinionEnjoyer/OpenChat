/**
 * Unread/read-state math (FR-MSG-010).
 *
 * Pure functions — zero React / React Native imports. Unit-tested exhaustively
 * in `__tests__/unread.test.ts`.
 *
 * The server is authoritative via `POST /channels/:id/read` which persists the
 * last-read message ID per user×channel.  There is no GET endpoint for read
 * states; the client tracks them locally and syncs up by POSTing on channel
 * view.
 */

// ── Public types ──

/** Per-channel read position, tracked locally and synced to the server. */
export interface ReadState {
  channelId: string;
  /** null = user opened the channel but has never read a message in it */
  lastReadMessageId: string | null;
}

/** Minimal message metadata needed for unread computation. */
export interface MessageMeta {
  id: string;
  channelId: string;
  authorId: string;
  /** true when this message @-mentions the current user */
  mentionsUser: boolean;
  deleted: boolean;
}

/** Per-channel unread summary returned by `computeChannelUnread`. */
export interface ChannelUnread {
  channelId: string;
  /** Count of messages strictly after the last-read message (excluding own & deleted). */
  unread: number;
  /** Count of mention messages within the unread region. */
  mentionCount: number;
  /**
   * The id of the LAST read message, which is where the "NEW" divider sits.
   * `null` when there is no read position (all messages are unread) or when
   * there are no unread messages.
   */
  dividerMessageId: string | null;
}

// ── Core computation ──

/**
 * Compute per-channel unread counts and divider position.
 *
 * @param channelId  The channel to compute for.
 * @param readState  The user's current read position (or undefined if never read).
 * @param messages   Messages for this channel, ordered oldest-first.
 * @param ownUserId  The current user's id, to exclude own messages.
 * @param opts.readStateIsAhead  When true and lastReadMessageId is not found in
 *   the loaded messages, assume the read position is past the loaded window
 *   (0 unread in the loaded set). When false (default), a missing boundary
 *   message is treated as deleted → all visible messages unread.
 */
export function computeChannelUnread(
  channelId: string,
  readState: ReadState | undefined,
  messages: MessageMeta[],
  ownUserId: string,
  opts?: { readStateIsAhead?: boolean },
): ChannelUnread {
  // Exclude deleted messages and own messages from unread counting.
  const visible = messages.filter(
    (m) => m.channelId === channelId && !m.deleted && m.authorId !== ownUserId,
  );

  // No messages at all → nothing to count.
  if (visible.length === 0) {
    return { channelId, unread: 0, mentionCount: 0, dividerMessageId: null };
  }

  // No read state → everything is unread (divider is null because "NEW" has
  // nowhere to anchor above).
  if (!readState || readState.lastReadMessageId === null) {
    const mentionCount = visible.filter((m) => m.mentionsUser).length;
    return { channelId, unread: visible.length, mentionCount, dividerMessageId: null };
  }

  // Find the boundary: the index of the last-read message in the visible list.
  const boundaryIdx = visible.findIndex((m) => m.id === readState.lastReadMessageId);

  // read state points to a message not present.
  if (boundaryIdx === -1) {
    // When the caller knows the read position is ahead of the loaded window,
    // return zero unread for this window.
    if (opts?.readStateIsAhead) {
      return { channelId, unread: 0, mentionCount: 0, dividerMessageId: null };
    }
    // Otherwise assume the boundary message was deleted → all visible unread.
    const mentionCount = visible.filter((m) => m.mentionsUser).length;
    return { channelId, unread: visible.length, mentionCount, dividerMessageId: null };
  }

  // Everything strictly after the boundary is unread.
  const unreadMessages = visible.slice(boundaryIdx + 1);
  const mentionCount = unreadMessages.filter((m) => m.mentionsUser).length;

  return {
    channelId,
    unread: unreadMessages.length,
    mentionCount,
    dividerMessageId: unreadMessages.length === 0 ? null : visible[boundaryIdx]!.id,
  };
}
