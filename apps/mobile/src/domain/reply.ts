/**
 * Pure reply-preview derivation (FR-MSG-005).
 *
 * Derives a quoted-reply preview: given a message that has replyToId, look up
 * the cached target. No value imports from React Native — import type only
 * from api/. This module is unit-testable without a renderer.
 */
import type { Message } from '../api/schema';

/** Maximum characters shown in a reply preview before truncation. */
export const REPLY_PREVIEW_MAX_LENGTH = 120;

/** Result of looking up the replied-to message in the local cache. */
export type ReplyPreview =
  | { found: true; id: string; authorName: string; content: string }
  | { found: false; id: string };

/**
 * Derive a reply preview from a message that has replyToId set.
 *
 * Priority:
 * 1. Embedded replyTo from the wire (server already resolves it) — use that.
 * 2. Fall back to the locally cached message (by id).
 * 3. Fall back to { found: false } — render a degraded "not found" state.
 *
 * @param msg       The message whose replyToId we're resolving.
 * @param cache     The newest-first list of cached messages (may be empty).
 * @returns         A ReplyPreview: either found (with truncated content) or
 *                  not-found (id only, for a scroll-to link).
 */
export function resolveReplyPreview(
  msg: Message,
  cache: readonly Message[],
): ReplyPreview | null {
  const replyToId = msg.replyToId;
  if (!replyToId) return null;

  // 1. Server-embedded replyTo (most reliable, already truncated by backend)
  if (msg.replyTo) {
    return {
      found: true as const,
      id: replyToId,
      authorName: msg.replyTo.authorName,
      content: msg.replyTo.content,
    };
  }

  // 2. Look up in local cache
  const target = cache.find((m) => m.id === replyToId);
  if (target) {
    let authorName: string;
    if (target.author) {
      authorName = target.author.displayName || target.author.username;
    } else {
      authorName = target.authorId.slice(0, 8);
    }
    return {
      found: true as const,
      id: replyToId,
      authorName,
      content: truncateReplyContent(target.content, REPLY_PREVIEW_MAX_LENGTH),
    };
  }

  // 3. Not in cache — degrade gracefully
  return { found: false as const, id: replyToId };
}

/**
 * Truncate reply content for a preview, appending '…' when truncated.
 * The backend already truncates to 120 chars in serializeMessage; this is
 * a belt-and-suspenders for client-side lookups of cached messages.
 */
export function truncateReplyContent(
  content: string,
  maxLen: number = REPLY_PREVIEW_MAX_LENGTH,
): string {
  if (content.length <= maxLen) return content;
  return content.slice(0, maxLen) + '\u2026'; // horizontal ellipsis
}
