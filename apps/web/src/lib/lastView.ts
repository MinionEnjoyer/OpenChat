export type SavedView =
  | { type: 'channel'; serverId: string; channelId: string }
  | { type: 'dm'; channelId: string }
  | { type: 'friends' };

const KEY = 'chat.view';

export function saveView(v: SavedView): void {
  try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* ignore */ }
}

export function loadView(): SavedView | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SavedView) : null;
  } catch {
    return null;
  }
}
