/**
 * The app's QueryClient plus the gateway→cache glue (06 §3). This module is the
 * only writer to the server-state cache; today its only write is invalidation —
 * `notify` is the backend's coarse "something changed" signal (E3) until
 * FR-SRV-009 adds granular events, and on reconnect we refetch everything
 * active because there is no upstream event replay.
 *
 * @satisfies FR-SRV-009 — granular guild-structure event cache updates
 */
import { QueryClient } from '@tanstack/react-query';
import type { S2CFrame } from '../realtime/events';
import { applyCreated, applyUpdated, applyDeleted } from './messages';
import { keys } from './keys';
import { useTyping } from '../stores/typing';
import { handleForegroundNotification } from '../features/notifications';
import { notifyIncoming } from '../features/notifications/localNotify';
import { useCallStore } from '../features/voice/CallStore';
import { usePresence } from '../stores/presence';
import { useSession } from '../stores/session';
import { logger } from '../lib/logger';
import type { Channel, Role, Member, Server } from '../api/schema';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

/** Return all server IDs from the cached servers list, or empty array. */
function getCachedServerIds(): string[] {
  const servers = queryClient.getQueryData<Server[]>(keys.servers);
  return servers?.map((s) => s.id) ?? [];
}

export function applyEvent(frame: S2CFrame): void {
  switch (frame.op) {
    case 'message.created': {
      // FR-MSG-002: reconcile by nonce / prepend (sync/messages owns the merge).
      // Relay wraps as {message}; the sender echo adds the nonce alongside.
      const msg = frame.d.message.nonce ? frame.d.message : { ...frame.d.message, nonce: frame.d.nonce ?? null };
      applyCreated(msg);
      // WO-NOTIF-LOCAL: route to local notification
      notifyIncoming(frame);
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
      handleForegroundNotification({ kind: 'notify' });
      break;
    case 'mention': {
      // WO-NOTIF-LOCAL: route to local notification (foreground→toast, background→OS notif)
      notifyIncoming(frame);
      break;
    }
    case 'call.ring': {
      const cd = frame.d as { channelId: string; callerId: string; callerName: string; callerAvatar: string | null };
      handleForegroundNotification({ kind: 'call.ring', callerName: cd.callerName });
      // Populate the incoming-call store so the full-screen overlay renders.
      useCallStore.getState().ring({
        channelId: cd.channelId,
        callerId: cd.callerId,
        callerName: cd.callerName,
        callerAvatar: cd.callerAvatar,
      });
      break;
    }
    case 'voice.occupancy': {
      // @satisfies FR-VOX-004 — invalidate voice participants on occupancy change
      const vd = frame.d as { channelId: string };
      void queryClient.invalidateQueries({ queryKey: keys.voiceParticipants(vd.channelId) });
      break;
    }
    // ── FR-SRV-009: granular guild-structure events ──
    case 'channel.created': {
      const ch = frame.d.channel as unknown as Channel;
      if (ch?.serverId) {
        queryClient.setQueryData<Channel[]>(keys.channels(ch.serverId), (old) =>
          old ? [ch, ...old] : [ch],
        );
      }
      break;
    }
    case 'channel.deleted': {
      const channelId = frame.d.channelId;
      let removed = false;
      for (const sid of getCachedServerIds()) {
        const prev = queryClient.getQueryData<Channel[]>(keys.channels(sid));
        if (prev?.some((c) => c.id === channelId)) {
          queryClient.setQueryData<Channel[]>(keys.channels(sid), (old) =>
            (old ?? []).filter((c) => c.id !== channelId),
          );
          removed = true;
          break;
        }
      }
      if (!removed) {
        for (const sid of getCachedServerIds()) {
          void queryClient.invalidateQueries({ queryKey: keys.channels(sid) });
        }
      }
      break;
    }
    case 'role.created': {
      const role = frame.d.role as unknown as Role;
      if (role?.serverId) {
        void queryClient.invalidateQueries({ queryKey: keys.roles(role.serverId) });
      }
      break;
    }
    case 'role.updated': {
      const role = frame.d.role as unknown as Role;
      if (role?.serverId) {
        void queryClient.invalidateQueries({ queryKey: keys.roles(role.serverId) });
      }
      break;
    }
    case 'role.deleted': {
      for (const sid of getCachedServerIds()) {
        void queryClient.invalidateQueries({ queryKey: keys.roles(sid) });
      }
      break;
    }
    case 'member.joined': {
      for (const sid of getCachedServerIds()) {
        void queryClient.invalidateQueries({ queryKey: keys.members(sid) });
      }
      break;
    }
    case 'member.left': {
      const userId = frame.d.userId;
      for (const sid of getCachedServerIds()) {
        queryClient.setQueryData<Member[]>(keys.members(sid), (old) =>
          (old ?? []).filter((m) => m.userId !== userId),
        );
      }
      break;
    }
    case 'member.kicked': {
      const userId = frame.d.userId;
      const currentUserId = useSession.getState().user?.id;
      if (userId === currentUserId) {
        void queryClient.invalidateQueries({ queryKey: keys.servers });
      }
      for (const sid of getCachedServerIds()) {
        queryClient.setQueryData<Member[]>(keys.members(sid), (old) =>
          (old ?? []).filter((m) => m.userId !== userId),
        );
      }
      break;
    }
    case 'server.updated': {
      const srv = frame.d.server as unknown as Server;
      if (srv?.id) {
        queryClient.setQueryData<Server[]>(keys.servers, (old) =>
          (old ?? []).map((s) => (s.id === srv.id ? srv : s)),
        );
      }
      break;
    }
    case 'server.deleted': {
      const serverId = frame.d.serverId;
      queryClient.setQueryData<Server[]>(keys.servers, (old) =>
        (old ?? []).filter((s) => s.id !== serverId),
      );
      void queryClient.invalidateQueries({ queryKey: keys.channels(serverId) });
      void queryClient.invalidateQueries({ queryKey: keys.members(serverId) });
      void queryClient.invalidateQueries({ queryKey: keys.roles(serverId) });
      break;
    }
    default:
      // FR-SRV-009: unknown op — make observable instead of silent drop.
      logger.warn('applyEvent: unhandled op', { op: (frame as { op: string }).op });
      break;
  }
}

/** Reconnect repair (06 §3): refetch every active query after resubscribe. */
export function resyncAll(): void {
  void queryClient.invalidateQueries();
}
