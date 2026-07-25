// FR-MSG-008 — Mentions: parser, autocomplete, highlighting
// Pure domain logic: zero React / React Native imports (06 §2).
//
// Canonical mention syntax (derived from web + server):
//   Emitted:   @username          (apps/web/src/App.tsx:1456 — insertMention)
//   Detected:  /(?:^|\s)@([\w.-]+)/g  (web line 755, server line 347)
//   @everyone: /(^|\s)@everyone\b/   (server line 345)
//   @here:     /(^|\s)@here\b/       (server line 346)
//
// The emitted syntax is plain text — no markup, no delimiters. The server
// regex-matches it for notification fan-out; the web regex-matches it for
// rendering. Both use the same pattern: @ followed by [\w.-]+.

// ── Inlined constants (domain/ purity: no api/schema imports) ──

const MENTION_EVERYONE_BIT = 1n << 7n; // from contracts/permissions.json

// ── Types ──

/** Minimal member shape needed for mention candidates. */
export interface MemberBrief {
  userId: string;
  user: {
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  } | null;
}

// ── Types ──

/** A mention candidate for autocomplete. */
export interface MentionCandidate {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

/** The type of mention detected in text. */
export type MentionType = 'user' | 'everyone' | 'here';

/** A parsed mention within message text. */
export interface MentionSpan {
  type: MentionType;
  /** The raw match text, e.g. " @alice" (with leading space) or "@alice" (at start). */
  raw: string;
  /** The username (for user mentions) or the special keyword. */
  value: string;
  /** Start index in the original text. */
  start: number;
  /** End index (exclusive) in the original text. */
  end: number;
}

/** A segment of parsed message text. */
export type TextSegment = PlainSegment | MentionSegment;

export interface PlainSegment {
  kind: 'plain';
  text: string;
}

export interface MentionSegment {
  kind: 'mention';
  /** Normalized lowercase value — use for lookup. */
  value: string;
  /** Original display value from text (preserves case). */
  display: string;
  /** Whether this mention targets the current user. */
  isSelf: boolean;
}

// ── Autocomplete helpers ──

/**
 * Build mention candidates from members data, optionally including
 * @everyone / @here for users with the MENTION_EVERYONE permission.
 *
 * @param members     Server members (undefined if not loaded).
 * @param canEveryone Whether to include @everyone / @here special candidates.
 */
export function buildMentionCandidates(
  members: MemberBrief[] | undefined,
  canEveryone: boolean,
): MentionCandidate[] {
  const specials: MentionCandidate[] = canEveryone
    ? [
        { id: '__everyone__', username: 'everyone', displayName: '@everyone', avatarUrl: null },
        { id: '__here__', username: 'here', displayName: '@here', avatarUrl: null },
      ]
    : [];
  const users: MentionCandidate[] = (members ?? [])
    .filter((m) => m.user != null)
    .map((m) => ({
      id: m.userId,
      username: m.user!.username,
      displayName: m.user!.displayName,
      avatarUrl: m.user!.avatarUrl,
    }));
  return [...specials, ...users];
}

/**
 * Check whether a draft text, at a given cursor position, has an active
 * @-mention trigger. Returns the query string (after @) and the start position
 * of the @ if found; null otherwise.
 *
 * Matches web behavior: apps/web/src/App.tsx:1445-1449.
 */
export function detectMentionTrigger(
  text: string,
  cursor: number,
  hasCandidates: boolean,
): { query: string; start: number } | null {
  if (!hasCandidates) return null;
  const pre = text.slice(0, cursor);
  const m = pre.match(/(?:^|\s)@([\w.-]*)$/);
  if (!m) return null;
  const query = m[1] ?? '';
  return { query, start: cursor - query.length - 1 };
}

/**
 * Filter mention candidates by a query string. Case-insensitive match on
 * username or (for special mentions) on the keyword.
 *
 * @param query  The text after @, e.g. "al" for "@al".
 */
export function filterMentionCandidates(
  candidates: MentionCandidate[],
  query: string,
): MentionCandidate[] {
  const q = query.toLowerCase();
  return candidates.filter((c) => {
    if (c.id === '__everyone__') return 'everyone'.startsWith(q);
    if (c.id === '__here__') return 'here'.startsWith(q);
    return c.username.toLowerCase().includes(q);
  });
}

/**
 * Insert a mention into text at the trigger position.
 *
 * Web behavior (apps/web/src/App.tsx:1452-1458): replaces "@query" with
 * "@username " (trailing space).
 */
export function insertMention(
  text: string,
  triggerStart: number,
  triggerQuery: string,
  username: string,
): string {
  const before = text.slice(0, triggerStart);
  const after = text.slice(triggerStart + 1 + triggerQuery.length);
  return `${before}@${username} ${after}`;
}

// ── Parsing (for rendering) ──

/**
 * Parse message text into segments (plain text + mentions).
 *
 * Matches both server dispatchMentions regex and web renderContent regex.
 * @everyone/@here are detected as mentions; user @mentions are checked against
 * a set of valid member usernames.
 *
 * @param text           The raw message content.
 * @param memberUsernames Lowercase set of valid usernames in the context.
 * @param currentUsername Lowercase username of the current user (for self-highlight).
 */
export function parseMentionSegments(
  text: string,
  memberUsernames: Set<string>,
  currentUsername: string | undefined,
): TextSegment[] {
  const segments: TextSegment[] = [];
  let last = 0;

  // Combined regex: match @everyone (with word boundary), @here (with word boundary),
  // or @username. Order matters: try every specific patterns first.
  const re = /@(everyone\b|here\b|([\w.-]+))/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    // Add plain text before this match
    if (m.index > last) {
      segments.push({ kind: 'plain', text: text.slice(last, m.index) });
    }

    const keyword = m[1]!.toLowerCase();
    const display = m[0]!; // e.g. "@Alice" or "@everyone"

    if (keyword === 'everyone' || keyword === 'here') {
      segments.push({
        kind: 'mention',
        value: keyword,
        display,
        isSelf: true, // @everyone/@here always highlighted as self-mention style
      });
      last = m.index + m[0].length;
    } else {
      // User mention — must be in the member set to highlight
      if (memberUsernames.has(keyword)) {
        segments.push({
          kind: 'mention',
          value: keyword,
          display,
          isSelf: currentUsername != null && keyword === currentUsername,
        });
        last = m.index + m[0].length;
      }
      // Non-member: don't split — stays in trailing plain segment
    }
  }

  // Trailing plain text
  if (last < text.length) {
    segments.push({ kind: 'plain', text: text.slice(last) });
  }

  return segments;
}

// ── Permission gate ──

/**
 * Check whether the given permissions bitfield includes MENTION_EVERYONE.
 *
 * @param permissionsStr  myPermissions as decimal string (from Server.myPermissions).
 * @param isOwner         Whether the user owns the server (owners have all perms).
 */
export function canMentionEveryone(
  permissionsStr: string | undefined,
  isOwner: boolean,
): boolean {
  if (isOwner) return true;
  if (!permissionsStr) return false;
  try {
    return (BigInt(permissionsStr) & MENTION_EVERYONE_BIT) !== 0n;
  } catch {
    return false;
  }
}

// ── Convenience: extract usernames from members ──

/**
 * Build a lowercase set of usernames from members for mention validation.
 */
export function buildMemberUsernameSet(members: MemberBrief[] | undefined): Set<string> {
  return new Set((members ?? []).filter((m) => m.user != null).map((m) => m.user!.username.toLowerCase()));
}
