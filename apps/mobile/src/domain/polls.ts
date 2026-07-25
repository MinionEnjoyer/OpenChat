/**
 * Pure poll helpers (FR-MSG-012). No cache writes — those live in sync/.
 *
 * Polls arrive embedded on Message objects with the wire shape:
 *   { id, question, multiple, closesAt, options: [{ id, text, voterIds }] }
 *
 * Poll changes (votes) surface as a full message.updated frame via the
 * gateway's relay() (events.gateway.ts MESSAGE_UPDATED case).
 * Voting POST returns 201 with the full message (NestJS default).
 */

// Import type only — domain/ MAY use import type from api/ (06 §2)
import type { Poll, PollOption } from '../api/schema';

// ── Validation ──

export interface PollValidation {
  valid: boolean;
  error?: string;
}

/**
 * Validates poll option count: must be 2..10 inclusive.
 * Returns the error string ready for display (NFR-11: strings live in
 * ui/strings.ts — this function returns a key, not a literal).
 */
export function validatePollOptions(options: string[]): PollValidation {
  if (options.length < 2) return { valid: false, error: 'poll.optionsTooFew' };
  if (options.length > 10) return { valid: false, error: 'poll.optionsTooMany' };
  return { valid: true };
}

// ── Tally ──

export interface TallyEntry {
  optionId: string;
  text: string;
  count: number;
  /** Percentage (0–100), rounded to nearest integer. NaN-safe. */
  pct: number;
}

/**
 * Compute poll results from option voterIds. Returns options ordered as-is
 * (preserving creation order). Handles zero-total-vote edge case (all
 * percentages = 0). Handles ties naturally (no tie-breaking needed).
 */
export function computeTally(options: PollOption[]): TallyEntry[] {
  const total = options.reduce((sum, o) => sum + o.voterIds.length, 0);
  return options.map((o) => ({
    optionId: o.id,
    text: o.text,
    count: o.voterIds.length,
    pct: total === 0 ? 0 : Math.round((o.voterIds.length / total) * 100),
  }));
}

// ── Own-vote ──

/**
 * Return the option id the user voted for, or null if no vote in any option.
 * For multiple-choice polls, returns the first match found.
 */
export function findUserVote(poll: Poll, userId: string): string | null {
  for (const o of poll.options) {
    if (o.voterIds.includes(userId)) return o.id;
  }
  return null;
}

// ── Closed state ──

export function isPollClosed(poll: Poll): boolean {
  if (!poll.closesAt) return false;
  return new Date(poll.closesAt).getTime() < Date.now();
}

// ── Vote switching logic ──

/**
 * Given the current vote state (which optionId the user already voted for,
 * if any) and the target optionId, determine what to do.
 *
 * For single-choice polls (multiple=false):
 *   - tapping your own vote → remove (toggle off)
 *   - tapping a different option → remove old + add new (switch)
 * For multi-choice polls (multiple=true):
 *   - tapping your own vote → remove (toggle off)
 *   - tapping a different option → add (keep existing)
 *
 * Returns { add: optionId | null, remove: optionId | null }.
 */
export function voteAction(
  poll: Poll,
  userId: string,
  targetOptionId: string,
): { add: string | null; remove: string | null } {
  const current = findUserVote(poll, userId);

  if (current === targetOptionId) {
    // Toggle off
    return { add: null, remove: targetOptionId };
  }

  if (poll.multiple) {
    // Multi-choice: just add, keep existing
    return { add: targetOptionId, remove: null };
  }

  // Single-choice: switch
  return { add: targetOptionId, remove: current };
}

// ── Optimistic update ──

/**
 * Optimistically apply a vote change to a poll, returning a new Poll.
 * Does NOT mutate the input.
 */
export function optimisticVote(
  poll: Poll,
  add: string | null,
  remove: string | null,
  userId: string,
): Poll {
  const options = poll.options.map((o) => {
    let voterIds = o.voterIds;
    if (o.id === remove) {
      voterIds = voterIds.filter((id) => id !== userId);
    }
    if (o.id === add) {
      if (!voterIds.includes(userId)) {
        voterIds = [...voterIds, userId];
      }
    }
    return { ...o, voterIds };
  });
  return { ...poll, options };
}
