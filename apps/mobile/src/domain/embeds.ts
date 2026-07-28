// FR-MSG-013 — Link auto-embed domain logic
// Pure functions: zero React / React Native imports (06 §2).
// Mirrors apps/web/src/components/MessageEmbeds.tsx client-side detection.

// ── URL extraction regex (matching web's URL_RE) ──
const URL_RE = /https?:\/\/[^\s<>"']+/g;

// ── Embed card types ──

export interface YouTubeCard {
  type: 'youtube';
  videoId: string;
  url: string;
}

export interface ShareImageCard {
  type: 'share-image';
  shareId: string;
  rawUrl: string;
  thumbUrl: string;
  url: string;
}

export interface ShareVideoCard {
  type: 'share-video';
  shareId: string;
  rawUrl: string;
  url: string;
}

export interface ShareGenericCard {
  type: 'share-generic';
  shareId: string;
  host: string;
  kind: string;
  thumbUrl: string;
  url: string;
}

export interface GifCard {
  type: 'gif';
  url: string;
  isVideo: boolean;
}

export interface LinkCard {
  type: 'link';
  url: string;
  hostname: string;
}

export type EmbedCard =
  | YouTubeCard
  | ShareImageCard
  | ShareVideoCard
  | ShareGenericCard
  | GifCard
  | LinkCard;

// ── URL classifiers (pure, no side effects) ──

/**
 * Extract a YouTube video id from a URL.
 * Handles youtube.com/watch, youtu.be, youtube.com/embed, youtube.com/shorts, youtube.com/v.
 */
export function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null;
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
      if (u.pathname === '/watch') return u.searchParams.get('v') ?? null;
      const m = u.pathname.match(/^\/(embed|shorts|v)\/([^/?]+)/);
      if (m) return m[2] ?? null;
    }
  } catch { /* ignore */ }
  return null;
}

/** Share asset reference info extracted from a URL. */
export interface ShareRef {
  kind: string;
  id: string;
  base: string;
  host: string;
}

/**
 * Detect if a URL points to a Share service asset.
 * shareHost is the configured Share service hostname.
 */
export function extractShareRef(url: string, shareHost: string): ShareRef | null {
  if (!shareHost) return null;
  try {
    const u = new URL(url);
    const h = u.hostname;
    if (h !== shareHost && !h.endsWith('.' + shareHost)) return null;
    const m = u.pathname.match(/^\/(i|v|d|t|m|a|raw|thumb)\/([A-Za-z0-9_-]+)/);
    if (!m) return null;
    return { kind: m[1]!, id: m[2]!, base: `${u.protocol}//${u.host}`, host: u.host };
  } catch { return null; }
}

/**
 * Detect if a URL is a direct image or GIF URL (giphy, tenor, or common image extension).
 */
export function isDirectImageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    if (/(^|\.)giphy\.com$/.test(host) || /(^|\.)tenor\.com$/.test(host) || host === 'media.tenor.com') {
      return /\.(gif|mp4|webp)$/i.test(u.pathname) || /giphy\.gif$/i.test(u.pathname) || u.pathname.includes('/media/');
    }
    return /\.(gif|png|jpe?g|webp|avif)$/i.test(u.pathname);
  } catch { return false; }
}

/**
 * Classify a single URL into an EmbedCard or null if not embeddable.
 * Priority: YouTube > direct image/GIF > Share > generic link.
 */
export function classifyUrl(url: string, shareHost: string): EmbedCard | null {
  // YouTube
  const yt = extractYouTubeId(url);
  if (yt) return { type: 'youtube', videoId: yt, url };

  // Direct image / GIF
  if (isDirectImageUrl(url)) {
    const isVideo = /\.mp4$/i.test(url);
    return { type: 'gif', url, isVideo };
  }

  // Share
  const s = extractShareRef(url, shareHost);
  if (s) {
    const raw = `${s.base}/raw/${s.id}`;
    const thumb = `${s.base}/thumb/${s.id}`;
    if (s.kind === 'i' || s.kind === 'raw') {
      return { type: 'share-image', shareId: s.id, rawUrl: raw, thumbUrl: thumb, url };
    }
    if (s.kind === 'v') {
      return { type: 'share-video', shareId: s.id, rawUrl: raw, url };
    }
    return { type: 'share-generic', shareId: s.id, host: s.host, kind: s.kind, thumbUrl: thumb, url };
  }

  // Generic link
  try {
    const hostname = new URL(url).hostname;
    return { type: 'link', url, hostname };
  } catch {
    return null;
  }
}

/** Extract all unique URLs from message content (max 4, matching web behavior). */
export function extractUrls(content: string): string[] {
  if (!content) return [];
  return Array.from(new Set(content.match(URL_RE) ?? [])).slice(0, 4);
}

/**
 * Classify all embeddable URLs in a message. Returns cards in order of appearance.
 */
export function classifyEmbeds(content: string, shareHost: string): EmbedCard[] {
  const urls = extractUrls(content);
  const cards: EmbedCard[] = [];
  for (const url of urls) {
    const card = classifyUrl(url, shareHost);
    if (card) cards.push(card);
  }
  return cards;
}

/**
 * Does the entire message content consist of a single URL that renders as an embed?
 * When true, the raw text content should be hidden (since the embed renders it).
 * Matching web's isSingleEmbedUrl logic.
 */
export function isSingleEmbedUrl(content: string, shareHost: string): boolean {
  const t = content.trim();
  if (!t || /\s/.test(t) || !/^https?:\/\//.test(t)) return false;
  return !!extractYouTubeId(t) || !!extractShareRef(t, shareHost) || isDirectImageUrl(t);
}
