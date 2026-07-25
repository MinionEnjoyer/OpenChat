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
