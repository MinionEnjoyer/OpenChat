// Fire an OS notification via the desktop shell. No-op in the browser, and skipped
// when the window is focused (so we don't nag while the user is looking at the app).
// `target` (optional) rides along so a click on the notification can focus the window
// and jump to the relevant DM/channel (handled Rust-side, see src-tauri notify command).
export interface NotifyTarget {
  channelId?: string;
  serverId?: string;
  kind?: 'dm' | 'mention' | 'call';
}

export function notifyNative(title: string, body: string, target?: NotifyTarget) {
  const t = (window as any).__TAURI__;
  if (!t?.core?.invoke) return;
  try { if (document.hasFocus && document.hasFocus()) return; } catch { /* ignore */ }
  t.core.invoke('notify', { title, body, target: target ?? null }).catch(() => {});
}
