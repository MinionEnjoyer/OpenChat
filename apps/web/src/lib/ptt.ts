// Push-to-talk key handling that spans web and desktop. In the browser we match
// KeyboardEvent.code while the window is focused; on desktop we register a global
// shortcut (via a Rust command) so PTT works even when the app is unfocused.
import type { PttKeybind } from './audioPrefs';

function tauri(): any {
  return (window as any).__TAURI__;
}

/** Map a KeyboardEvent.code to a Tauri accelerator token, or null if unsupported. */
function codeToAccel(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3); // KeyV -> V
  if (/^Digit[0-9]$/.test(code)) return code.slice(5); // Digit1 -> 1
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code; // F1..F24
  const map: Record<string, string> = {
    Space: 'Space', Enter: 'Enter', Tab: 'Tab', Escape: 'Escape', Backspace: 'Backspace',
    ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
    Minus: '-', Equal: '=', Backslash: '\\', Semicolon: ';', Quote: "'",
    Comma: ',', Period: '.', Slash: '/', BracketLeft: '[', BracketRight: ']', Backquote: '`',
  };
  return map[code] ?? null;
}

/** Build the Tauri accelerator string ("Ctrl+Shift+V") for a keybind, or null if unmappable. */
export function keybindToAccelerator(kb: PttKeybind): string | null {
  const key = codeToAccel(kb.code);
  if (!key) return null;
  const parts: string[] = [];
  if (kb.ctrl) parts.push('Ctrl');
  if (kb.shift) parts.push('Shift');
  if (kb.alt) parts.push('Alt');
  if (kb.meta) parts.push('Super');
  parts.push(key);
  return parts.join('+');
}

/** Friendly key name for display (e.g. "KeyV" -> "V", "ArrowUp" -> "↑"). */
function codeToLabel(code: string): string {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  const map: Record<string, string> = {
    Space: 'Space', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
    Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']',
    Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\',
  };
  return map[code] ?? code;
}

/** Human-readable label for a keybind, e.g. "Shift + V". */
export function describeKeybind(kb: PttKeybind): string {
  const parts: string[] = [];
  if (kb.ctrl) parts.push('Ctrl');
  if (kb.shift) parts.push('Shift');
  if (kb.alt) parts.push('Alt');
  if (kb.meta) parts.push('⌘');
  parts.push(codeToLabel(kb.code));
  return parts.join(' + ');
}

/** Build a PttKeybind from a captured keydown (returns null for a bare modifier press). */
export function keybindFromEvent(e: KeyboardEvent): PttKeybind | null {
  const MODIFIER_CODES = ['ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight'];
  if (MODIFIER_CODES.includes(e.code)) return null;
  const kb: PttKeybind = {
    code: e.code, ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey, meta: e.metaKey, label: '',
  };
  kb.label = describeKeybind(kb);
  return kb;
}

/**
 * Register a desktop global shortcut for PTT. No-ops (and returns a no-op cleanup)
 * when not running under Tauri, so callers can invoke it unconditionally.
 */
export async function registerDesktopPtt(
  accelerator: string | null,
  onDown: () => void,
  onUp: () => void,
): Promise<() => void> {
  const t = tauri();
  if (!t?.core?.invoke || !accelerator) return () => {};
  const unsubs: Array<() => void> = [];
  try {
    await t.core.invoke('register_ptt', { accelerator });
    t.event?.listen?.('ptt://down', () => onDown()).then((u: () => void) => unsubs.push(u)).catch(() => {});
    t.event?.listen?.('ptt://up', () => onUp()).then((u: () => void) => unsubs.push(u)).catch(() => {});
  } catch {
    /* ignore — PTT falls back to in-app (focused) key handling */
  }
  return () => {
    unsubs.forEach((u) => { try { u(); } catch { /* ignore */ } });
    try { t.core.invoke('unregister_ptt'); } catch { /* ignore */ }
  };
}
