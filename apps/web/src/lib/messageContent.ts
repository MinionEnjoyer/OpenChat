const STICKER_PREFIX = 'sticker::';
const STICKER_MEDIA_PATH = /^\/api\/media\/[A-Za-z0-9_-]+\/raw$/;
/** Encode a sticker as a message while keeping the wire format backwards-compatible. */
export function stickerContent(url: string): string {
  return STICKER_PREFIX + url;
}

/** Return the sticker image URL when content is a valid sticker message. */
export function stickerUrl(content: string): string | null {
  const trimmed = content.trim();
  if (!trimmed.startsWith(STICKER_PREFIX)) return null;

  const value = trimmed.slice(STICKER_PREFIX.length).trim();
  // Uploads proxied through OpenChat intentionally return same-origin media paths.
  // Accept only that exact API shape; arbitrary relative paths remain plain text.
  if (STICKER_MEDIA_PATH.test(value)) return value;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? value : null;
  } catch {
    return null;
  }
}

export function isStickerContent(content: string): boolean {
  return stickerUrl(content) !== null;
}

/** Human-readable text for compact surfaces that cannot render the sticker itself. */
export function messageSummary(content: string, maxLength = 120): string {
  if (isStickerContent(content)) return 'Sticker';
  const summary = content === '\u200b' ? '(attachment)' : content.trim();
  return (summary || '(attachment)').slice(0, maxLength);
}
