/**
 * The app's QueryClient plus the gateway→cache glue (06 §3). This module is the
 * only writer to the server-state cache; today its only write is invalidation —
 * `notify` is the backend's coarse "something changed" signal (E3) until
 * FR-SRV-009 adds granular events, and on reconnect we refetch everything
 * active because there is no upstream event replay.
 */
import { QueryClient } from '@tanstack/react-query';
import type { S2CFrame } from '../realtime/events';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

export function applyEvent(frame: S2CFrame): void {
  switch (frame.op) {
    case 'notify':
      void queryClient.invalidateQueries();
      break;
    default:
      // Message/typing/presence ops are consumed starting Phase 2.
      break;
  }
}

/** Reconnect repair (06 §3): refetch every active query after resubscribe. */
export function resyncAll(): void {
  void queryClient.invalidateQueries();
}
