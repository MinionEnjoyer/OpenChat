/**
 * Pure reaction helpers (FR-MSG-006). No cache writes — those live in sync/.
 *
 * Backend pushes reactions as a FULL message.updated frame (E7-confirmed).
 * The incoming message.reactions array is the ground truth for a message;
 * the client merges it wholesale — no local increment/decrement merging.
 */

/** Reaction group as received on the wire (pre-aggregated by the backend). */
export interface ReactionGroup {
  emoji: string;
  count: number;
  userIds: string[];
}

export interface EmojiEntry {
  emoji: string;
  label: string;
  keywords: string[];
}

/** Nominal emoji set for v1: the canonical shortlist. */
export const BUILTIN_EMOJIS: EmojiEntry[] = [
  { emoji: '👍', label: '+1', keywords: ['thumbsup', 'thumbs', 'up', 'like', 'yes', 'ok'] },
  { emoji: '👎', label: '-1', keywords: ['thumbsdown', 'down', 'dislike', 'no'] },
  { emoji: '❤️', label: 'heart', keywords: ['heart', 'love', 'like'] },
  { emoji: '😂', label: 'joy', keywords: ['joy', 'laugh', 'lol', 'funny', 'lmao'] },
  { emoji: '😮', label: 'open mouth', keywords: ['wow', 'surprise', 'shock', 'omg', 'open'] },
  { emoji: '😢', label: 'cry', keywords: ['cry', 'sad', 'tear', 'crying'] },
  { emoji: '😡', label: 'pout', keywords: ['angry', 'mad', 'rage', 'pout'] },
  { emoji: '🎉', label: 'tada', keywords: ['party', 'celebrate', 'congrats', 'tada'] },
  { emoji: '🚀', label: 'rocket', keywords: ['rocket', 'launch', 'ship', 'fast'] },
  { emoji: '👀', label: 'eyes', keywords: ['eyes', 'look', 'see', 'watch'] },
  { emoji: '💯', label: '100', keywords: ['100', 'hundred', 'perfect', 'score'] },
  { emoji: '🔥', label: 'fire', keywords: ['fire', 'hot', 'flame', 'lit'] },
  { emoji: '✅', label: 'check', keywords: ['check', 'done', 'complete', 'tick'] },
  { emoji: '❌', label: 'cross', keywords: ['cross', 'x', 'wrong', 'no', 'delete'] },
  { emoji: '🤔', label: 'thinking', keywords: ['think', 'hmm', 'thinking'] },
  { emoji: '🙏', label: 'pray', keywords: ['pray', 'please', 'thanks', 'thank'] },
];

/**
 * Filter emojis by a search query. Matches against label and keywords
 * (all lowercased). An empty query returns the full set.
 */
export function filterEmojis(
  query: string,
  emojis: EmojiEntry[] = BUILTIN_EMOJIS,
): EmojiEntry[] {
  const q = query.toLowerCase().trim();
  if (!q) return emojis;
  return emojis.filter(
    (e) =>
      e.label.toLowerCase().includes(q) ||
      e.keywords.some((k) => k.toLowerCase().includes(q)),
  );
}

/**
 * Does the current user have a reaction with this emoji on this message?
 */
export function hasUserReacted(
  reactions: ReactionGroup[],
  userId: string,
  emoji: string,
): boolean {
  const group = reactions.find((r) => r.emoji === emoji);
  return group ? group.userIds.includes(userId) : false;
}

/**
 * Merge the incoming message.reactions into a cached message. The backend
 * sends the complete reactions array for the message — replace wholesale.
 * Also updates editedAt (reactions don't set it on the backend, but other
 * update paths like edit/pin do, so preserve whatever the server sends).
 */
export function mergeMessageUpdate<T extends { reactions: ReactionGroup[]; editedAt: string | null }>(
  cached: T,
  incoming: T,
): T {
  return { ...cached, ...incoming, reactions: incoming.reactions };
}

/**
 * Toggle prediction (optimistic): add or remove userId from the reaction
 * group for emoji on a cloned reactions array. Returns a new array — does
 * NOT mutate the input. Used for instant feedback before the server ack.
 */
export function optimisticToggle(
  reactions: ReactionGroup[],
  userId: string,
  emoji: string,
  mode: 'add' | 'remove',
): ReactionGroup[] {
  const idx = reactions.findIndex((r) => r.emoji === emoji);
  if (mode === 'add') {
    if (idx >= 0) {
      const g = reactions[idx]!;
      if (g.userIds.includes(userId)) return reactions; // already there
      return [
        ...reactions.slice(0, idx),
        { emoji: g.emoji, count: g.count + 1, userIds: [...g.userIds, userId] },
        ...reactions.slice(idx + 1),
      ];
    }
    return [...reactions, { emoji, count: 1, userIds: [userId] }];
  }
  // remove
  if (idx < 0) return reactions;
  const g = reactions[idx]!;
  if (!g.userIds.includes(userId)) return reactions;
  const nextUsers = g.userIds.filter((u) => u !== userId);
  if (nextUsers.length === 0) {
    return reactions.filter((_, i) => i !== idx);
  }
  return [
    ...reactions.slice(0, idx),
    { emoji: g.emoji, count: nextUsers.length, userIds: nextUsers },
    ...reactions.slice(idx + 1),
  ];
}

/**
 * Is this emoji in the builtin set? (Used by the picker to decide whether
 * to show the builtin grid or fall back to a raw emoji preview.)
 */
export function isBuiltinEmoji(emoji: string): boolean {
  return BUILTIN_EMOJIS.some((e) => e.emoji === emoji);
}
