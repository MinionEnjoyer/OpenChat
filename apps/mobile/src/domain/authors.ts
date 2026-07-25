/**
 * Pure author-display helpers (FR-MSG-002). No cache writes — those live in sync/.
 *
 * API embeds `author` on every message (observed 2026-07-25 via curl against
 * GET /channels/:id/messages). When `author` is present we use it directly;
 * otherwise we fall back to a short ID fragment.
 */

/** Minimal author shape embedded in message responses. */
export interface AuthorBrief {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  status: string | null;
}

/**
 * Resolve the display name for a message author.
 *
 * Priority:
 * 1. Own messages always show the current user's display name (FR-MSG-002).
 * 2. Other authors show their embedded `author.displayName` if available,
 *    falling back to `author.username`, falling back to `authorId.slice(0,8)`.
 *
 * @param authorId   The message's authorId (always present).
 * @param author     The embedded author brief (may be absent for pending/legacy messages).
 * @param currentUserId   The logged-in user's id (null if not logged in).
 * @param currentDisplayName  The logged-in user's displayName.
 * @param currentUsername     The logged-in user's username.
 */
export function resolveAuthorName(
  authorId: string,
  author: AuthorBrief | undefined,
  currentUserId: string | null | undefined,
  currentDisplayName: string | null | undefined,
  currentUsername: string | null | undefined,
): string {
  const fallback = authorId.slice(0, 8);

  // Own message: always show own display name
  if (currentUserId && authorId === currentUserId) {
    return (currentDisplayName || currentUsername) || fallback;
  }
  // Other author: try embedded author brief
  if (author) {
    return (author.displayName || author.username) || fallback;
  }
  // Fallback (pending message or legacy data without author embed)
  return fallback;
}
