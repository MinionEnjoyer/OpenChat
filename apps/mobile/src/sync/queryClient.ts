/**
 * The app's QueryClient plus the gateway→cache glue (06 §3). This module is the
 * only writer to the server-state cache; today its only write is invalidation —
 * `notify` is the backend's coarse "something changed" signal (E3) until
 * FR-SRV-009 adds granular events, and on reconnect we refetch everything
 * active because there is no upstream event replay.
 */
import { QueryClient } from '@tanstack/react-query';
import type { S2CFrame } from '../realtime/events';
import { applyCreated, applyUpdated, applyDeleted } from './messages';
import { useTyping } from '../stores/typing';
import { usePresence } from '../stores/presence';

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
    case 'message.created': {
      // FR-MSG-002: reconcile by nonce / prepend (sync/messages owns the merge).
      // Relay wraps as {message}; the sender echo adds the nonce alongside.
      const msg = frame.d.message.nonce ? frame.d.message : { ...frame.d.message, nonce: frame.d.nonce ?? null };
      applyCreated(msg);
      break;
    }
    case 'message.updated':
      // Reactions, edits, pins arrive as a full message.updated frame.
      applyUpdated(frame.d.message);
      break;
    case 'message.deleted':
      // FR-MSG-004: Gateway sends d: {id, channelId}.
      applyDeleted(frame.d.channelId, frame.d.id);
      break;
    case 'typing': {
      // FR-MSG-009: record the typist in the typing store.
      const td = frame.d as { channelId: string; userId: string };
      useTyping.getState().recordTyping(td.channelId, td.userId);
      break;
    }
    case 'ready': {
      // FR-SOC-004: seed own user presence from the ready frame.
      if (frame.d?.user?.id && frame.d?.user?.status) {
        usePresence.getState().setPresence(frame.d.user.id, frame.d.user.status);
      }
      break;
    }
    case 'presence': {
      // FR-SOC-004: live presence update for any user.
      const pd = frame.d as { userId: string; status: string };
      usePresence.getState().setPresence(pd.userId, pd.status);
      break;
    }
    case 'notify':
      void queryClient.invalidateQueries();
      break;
    default:
      break;
  }
}

/** Reconnect repair (06 §3): refetch every active query after resubscribe. */
export function resyncAll(): void {
  void queryClient.invalidateQueries();
}
