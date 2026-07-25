/**
 * FR-MSG-015 — Message link format.
 *
 * Emits openchat://chat/{channelId}/{messageId}. The app scheme is 'openchat'
 * (app.json) and deep-link routing lands in Phase 3 (FR-APP-005), but this
 * format is forward-compatible: a future deep-link handler will parse
 * /chat/:channelId/:messageId and navigate to the channel+message.
 */

/**
 * Build a deep-link URL for a message.
 * Forward-compatible with FR-APP-005 deep-link routing (Phase 3).
 */
export function buildMessageLink(channelId: string, messageId: string): string {
  return `openchat://chat/${channelId}/${messageId}`;
}

// ── FR-SRV-006 — Invite deep-link parsing ──

/**
 * Parsed invite deep-link result.
 * Only one of `inviteCode` or `error` is set.
 */
export interface ParsedInviteLink {
  inviteCode?: string;
  error?: 'malformed' | 'wrong_scheme' | 'wrong_host' | 'empty_code';
}

/**
 * Parse an invite deep-link URL.
 *
 * Accepts:
 * - `openchat://invite/<code>`
 * - `https://<CHAT_HOST>/invite/<code>` (universal link)
 *
 * Returns `{ inviteCode }` on success or `{ error }` on failure.
 *
 * @satisfies FR-SRV-006, FR-APP-005
 */
export function parseInviteLink(url: string): ParsedInviteLink {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { error: 'malformed' };
  }

  // openchat:// custom scheme — hostname is the first path segment
  if (parsed.protocol === 'openchat:') {
    if (parsed.hostname !== 'invite') return { error: 'malformed' };
    const code = parsed.pathname.replace(/^\/+/, '');
    if (code) return { inviteCode: code };
    return { error: 'empty_code' };
  }

  // https:// universal link
  if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
    const segments = parsed.pathname.replace(/^\/+/, '').split('/');
    if (segments[0] === 'invite' && segments[1]) {
      return { inviteCode: segments[1] };
    }
    if (segments[0] === 'invite' && !segments[1]) {
      return { error: 'empty_code' };
    }
    return { error: 'malformed' };
  }

  return { error: 'wrong_scheme' };
}

/**
 * Build an invite deep-link URL.
 * @satisfies FR-SRV-006
 */
export function buildInviteLink(code: string): string {
  return `openchat://invite/${encodeURIComponent(code)}`;
}
