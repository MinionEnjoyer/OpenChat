/**
 * Pure pagination helpers (FR-MSG-001).
 *
 * Page merge, day dividers, and author grouping — all pure functions,
 * testable without a renderer.
 */
/**
 * Minimal message shape needed for pagination operations.
 * Structural typing means real Message / PendingMessage objects from the
 * API layer satisfy this interface automatically.
 */
export interface Message {
  id: string;
  authorId: string;
  createdAt: string;
}

// ── Page merge ─────────────────────────────────────────────────────────

/**
 * Merge an older page into an existing newest-first list. Dedup by id;
 * preserves newest-first order. The incoming page must also be newest-first.
 *
 * @param existing  Already-loaded messages (newest-first). May be empty.
 * @param incoming  The next older page (newest-first).
 * @returns         Merged list, newest-first, no duplicates.
 */
export function mergePage(
  existing: readonly Message[],
  incoming: readonly Message[],
): Message[] {
  if (existing.length === 0) return [...incoming];
  if (incoming.length === 0) return [...existing];

  const existingIds = new Set(existing.map((m) => m.id));
  const novel = incoming.filter((m) => !existingIds.has(m.id));

  // Incoming is older, so it goes after existing (at the end of
  // the newest-first list).
  return [...existing, ...novel];
}

// ── Day dividers ───────────────────────────────────────────────────────

/** Marker interface for synthetic day-divider items inserted into the list. */
export interface DayDivider {
  kind: 'day-divider';
  /** ISO date string (YYYY-MM-DD). */
  date: string;
}

export type MessageOrDivider = Message | DayDivider;

/**
 * Insert day dividers between messages from different calendar days.
 * Messages are assumed newest-first. Dividers are inserted when the
 * current message is from a different day than the *next* (older) one.
 *
 * @param messages  Newest-first message list.
 * @returns         List with synthetic day dividers inserted.
 */
export function insertDayDividers(
  messages: readonly Message[],
): MessageOrDivider[] {
  if (messages.length === 0) return [];

  const result: MessageOrDivider[] = [];
  for (let i = 0; i < messages.length; i++) {
    result.push(messages[i]!);

    if (i < messages.length - 1) {
      const current = messages[i]!;
      const next = messages[i + 1]!;
      const currentDay = extractDate(current.createdAt);
      const nextDay = extractDate(next.createdAt);
      if (currentDay !== nextDay) {
        result.push({ kind: 'day-divider', date: currentDay });
      }
    }
  }
  return result;
}

function extractDate(iso: string): string {
  return iso.slice(0, 10); // YYYY-MM-DD
}

// ── Author grouping ────────────────────────────────────────────────────

/**
 * Author grouping: consecutive messages from the same author within
 * AUTHOR_GROUP_MS (7 minutes) are considered a group. The *first* message
 * in a group shows the author header; subsequent messages within the group
 * do not.
 *
 * @param messages  Newest-first message list.
 * @returns         Array of booleans, one per message: true = show author header.
 */
export const AUTHOR_GROUP_MS = 7 * 60 * 1000;

export function computeAuthorGroups(
  messages: readonly Message[],
): boolean[] {
  if (messages.length === 0) return [];
  const result: boolean[] = new Array(messages.length).fill(true);

  for (let i = 1; i < messages.length; i++) {
    const prev = messages[i - 1]!;
    const curr = messages[i]!;
    if (
      prev.authorId === curr.authorId &&
      Math.abs(new Date(prev.createdAt).getTime() - new Date(curr.createdAt).getTime()) <= AUTHOR_GROUP_MS
    ) {
      // Suppress author for this message (not the first in group)
      result[i] = false;
    }
  }
  return result;
}
