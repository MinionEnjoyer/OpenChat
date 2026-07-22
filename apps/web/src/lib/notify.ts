// Fire an OS notification via the desktop shell. No-op in the browser, and skipped
// when the window is focused (so we don't nag while the user is looking at the app).
export function notifyNative(title: string, body: string) {
  const t = (window as any).__TAURI__;
  if (!t?.core?.invoke) return;
  try { if (document.hasFocus && document.hasFocus()) return; } catch { /* ignore */ }
  t.core.invoke('notify', { title, body }).catch(() => {});
}
