/**
 * Pure typing-indicator aggregation (FR-MSG-009). No cache writes, I/O, or
 * UI-string imports — domain/ must stay renderer-free (06 §2). The caller
 * supplies the localised fragments.
 */
export interface TypingFragments {
  /** Suffix for a single typist, e.g. "is typing…" */
  one: string;
  /** Joiner for two typists, e.g. "and" */
  twoConjunction: string;
  /** Suffix for two typists, e.g. "are typing…" */
  two: string;
  /** Fallback for 3+ typists, e.g. "Several people are typing…" */
  many: string;
}

/**
 * Format a list of typist display names into an aggregation string.
 *
 *   1 user   → "Alice is typing…"
 *   2 users  → "Alice and Bob are typing…"
 *   3+ users → "Several people are typing…"
 *
 * Empty array returns the empty string (no indicator shown).
 */
export function formatTyping(names: readonly string[], f: TypingFragments): string {
  const count = names.length;
  if (count === 0) return '';
  if (count === 1) return `${names[0]} ${f.one}`;
  if (count === 2) return `${names[0]} ${f.twoConjunction} ${names[1]} ${f.two}`;
  return f.many;
}
