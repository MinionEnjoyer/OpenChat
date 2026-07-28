/**
 * Unread/read-state hooks (FR-MSG-010).
 *
 * Pure local state — the server has no GET endpoint for read states. The client
 * tracks them via react-query cache and syncs up by POSTing on channel view.
 */
import { useCallback, useMemo } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../../stores/session';
import { useSession } from '../../stores/session';
import { keys } from '../../sync/keys';
import { messageKeys } from '../../sync/messages';
import { queryClient } from '../../sync/queryClient';
import { computeChannelUnread } from '../../domain/unread';
import type { ReadState, ChannelUnread, MessageMeta } from '../../domain/unread';
import type { Message } from '../../api/schema';

// ── Mention detection ──

/**
 * Check whether a message content mentions the current user.
 * Matches the server-side dispatchMentions regex: @everyone, @here, or @username.
 */
function messageMentionsUser(content: string, username: string): boolean {
  if (/@everyone\b/i.test(content)) return true;
  if (/@here\b/i.test(content)) return true;
  // Escape username for regex, then match (?:^|\s)@username\b (case-insensitive)
  const escaped = username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?:^|\\s)@${escaped}\\b`, 'i');
  return re.test(content);
}

// ── Message → MessageMeta adapter ──

function toMessageMeta(m: Message, ownUsername: string | undefined): MessageMeta {
  return {
    id: m.id,
    channelId: m.channelId,
    authorId: m.authorId,
    mentionsUser: ownUsername ? messageMentionsUser(m.content, ownUsername) : false,
    deleted: m.deletedAt !== null,
  };
}

// ── Query for read states (local cache, no server GET) ──

/**
 * Return the current read-state map from the local cache.
 * Initialises as empty; updated by useMarkRead's onSuccess.
 */
export function useReadStateMap(): Map<string, ReadState> {
  const { data } = useQuery<Map<string, ReadState>>({
    queryKey: keys.readStates,
    queryFn: () => new Map(),
    staleTime: Infinity,
  });
  return data ?? new Map();
}

/**
 * Imperative setter for the read-state cache.
 */
export function useSetReadState() {
  return useCallback(
    (rs: ReadState) => {
      queryClient.setQueryData<Map<string, ReadState>>(keys.readStates, (prev) => {
        const next = new Map(prev);
        next.set(rs.channelId, rs);
        return next;
      });
    },
    [],
  );
}

// ── markRead mutation ──

export function useMarkRead() {
  return useMutation({
    mutationFn: ({
      channelId,
      lastReadMessageId,
    }: {
      channelId: string;
      lastReadMessageId: string;
    }) =>
      api.request<{ success: true }>(`/channels/${channelId}/read`, {
        method: 'POST',
        body: { lastReadMessageId },
      }),
    onSuccess: (_data, vars) => {
      queryClient.setQueryData<Map<string, ReadState>>(keys.readStates, (prev) => {
        const next = new Map(prev);
        next.set(vars.channelId, {
          channelId: vars.channelId,
          lastReadMessageId: vars.lastReadMessageId,
        });
        return next;
      });
    },
  });
}

// ── Per-server unread computation ──

/**
 * Compute per-channel unread for every channel in a server using message cache
 * and the local read-state map. Returns Map<channelId, ChannelUnread>.
 *
 * Channels with no messages in cache get 0 unread (nothing to compute).
 */
export function useChannelUnread(channelIds: string[]): Map<string, ChannelUnread> {
  const readStateMap = useReadStateMap();
  const user = useSession((s) => s.user);
  const ownUsername = user?.username;

  return useMemo(() => {
    const result = new Map<string, ChannelUnread>();
    if (!ownUsername) return result;

    for (const channelId of channelIds) {
      const messages = queryClient.getQueryData<Message[]>(messageKeys.list(channelId));
      const readState = readStateMap.get(channelId);

      if (!messages || messages.length === 0) {
        result.set(channelId, {
          channelId,
          unread: 0,
          mentionCount: 0,
          dividerMessageId: null,
        });
        continue;
      }

      // Messages are stored newest-first; computeChannelUnread expects oldest-first.
      const oldestFirst = [...messages].reverse();
      const metas: MessageMeta[] = oldestFirst.map((m) =>
        toMessageMeta(m, ownUsername),
      );

      result.set(
        channelId,
        computeChannelUnread(channelId, readState, metas, user.id),
      );
    }
    return result;
  }, [channelIds, readStateMap, user, ownUsername]);
}
