/**
 * PresenceDot — FR-SOC-004. A live presence indicator dot that reads
 * from the presence store. Use everywhere a user is rendered.
 *
 * @satisfies FR-SOC-004
 */
import { View, StyleSheet } from 'react-native';
import { usePresence } from '../../stores/presence';
import { PRESENCE_PRIORITY } from '../../domain/members';

interface Props {
  userId: string;
  /** Optional fallback status (from REST data) until the live WS event arrives. */
  fallback?: string | null;
  /** Override dot size (default 10). */
  size?: number;
}

/**
 * Renders a colored circle indicating the user's live presence.
 *
 *   ONLINE     → #23a55a (green)
 *   DND        → #da373c (red)
 *   AWAY       → #f0b232 (yellow)
 *   INVISIBLE  → #80848e (grey — treated as OFFLINE)
 *   OFFLINE    → #80848e (grey)
 *   unknown    → #80848e (grey, OFFLINE fallback per spec)
 */
export function PresenceDot({ userId, fallback, size = 10 }: Props): React.JSX.Element {
  const liveStatus = usePresence((s) => s.presenceMap[userId]);
  // Prefer live WS status, fall back to REST data, then OFFLINE.
  const status = liveStatus ?? fallback ?? 'OFFLINE';
  const color = presenceColor(status);
  return <View style={[styles.dot, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }]} />;
}

/** Deterministic color mapping by status string — kept outside the component for testability. */
export function presenceColor(status: string): string {
  const pri = PRESENCE_PRIORITY[status] ?? 0;
  if (pri >= 4) return '#23a55a'; // ONLINE
  if (pri >= 3) return '#da373c'; // DND
  if (pri >= 2) return '#f0b232'; // AWAY
  return '#80848e';               // INVISIBLE / OFFLINE / unknown
}

export function presenceLabel(status: string): string {
  switch (status) {
    case 'ONLINE': return 'Online';
    case 'DND': return 'Do Not Disturb';
    case 'AWAY': return 'Away';
    case 'INVISIBLE': return 'Invisible';
    default: return 'Offline';
  }
}

const styles = StyleSheet.create({
  dot: {
    // Base size set inline; just a positioning container.
  },
});
