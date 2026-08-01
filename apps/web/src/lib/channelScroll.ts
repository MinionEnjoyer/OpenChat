export interface ChannelScrollPosition {
  messageId: string;
  offset: number;
  updatedAt: number;
}

const STORAGE_KEY = 'openchat.channelScroll.v1';
const MAX_CHANNELS = 100;
let positions: Record<string, ChannelScrollPosition> | null = null;
let flushTimer: number | undefined;

function loadPositions(): Record<string, ChannelScrollPosition> {
  if (positions) return positions;
  positions = {};
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return positions;
    for (const [channelId, rawValue] of Object.entries(parsed as Record<string, unknown>)) {
      if (!rawValue || typeof rawValue !== 'object') continue;
      const value = rawValue as Partial<ChannelScrollPosition>;
      if (!channelId || typeof value.messageId !== 'string' || typeof value.offset !== 'number') continue;
      positions[channelId] = {
        messageId: value.messageId,
        offset: Math.max(-10_000, Math.min(10_000, value.offset)),
        updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : 0,
      };
    }
  } catch { /* unavailable or malformed storage starts clean */ }
  return positions;
}

function flush() {
  flushTimer = undefined;
  if (!positions) return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(positions)); } catch { /* ignore */ }
}

function scheduleFlush() {
  if (flushTimer !== undefined) window.clearTimeout(flushTimer);
  flushTimer = window.setTimeout(flush, 120);
}

export function getChannelScrollPosition(channelId: string): ChannelScrollPosition | null {
  return loadPositions()[channelId] || null;
}

export function saveChannelScrollPosition(channelId: string, messageId: string, offset: number) {
  if (!channelId || !messageId || !Number.isFinite(offset)) return;
  const all = loadPositions();
  all[channelId] = {
    messageId,
    offset: Math.max(-10_000, Math.min(10_000, Math.round(offset))),
    updatedAt: Date.now(),
  };
  const entries = Object.entries(all);
  if (entries.length > MAX_CHANNELS) {
    entries.sort(([, a], [, b]) => b.updatedAt - a.updatedAt);
    positions = Object.fromEntries(entries.slice(0, MAX_CHANNELS));
  }
  scheduleFlush();
}

if (typeof window !== 'undefined') window.addEventListener('pagehide', flush);
