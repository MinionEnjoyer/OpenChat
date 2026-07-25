/**
 * usePaginatedMessages — FR-MSG-001
 *
 * Hook that wraps the initial message fetch and provides infinite upward
 * pagination. Uses the ['messages', channelId] cache via sync/messages.
 */
import { useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../stores/session';
import { messageKeys, applyPage, type PendingMessage } from '../../sync/messages';
import type { Message } from '../../api/schema';

export interface PaginatedMessages {
  /** The full merged message list (newest-first). */
  messages: PendingMessage[] | undefined;
  /** True during the initial load. */
  isLoading: boolean;
  /** True when fetching an older page. */
  isFetchingMore: boolean;
  /** Whether there are more older messages to fetch. */
  hasMore: boolean;
  /** Fetch the next older page. No-op if already fetching or no more. */
  fetchOlder: () => void;
}

export function usePaginatedMessages(
  channelId: string,
  pageSize = 50,
): PaginatedMessages {
  const fetchingMore = useRef(false);

  const query = useQuery({
    queryKey: messageKeys.list(channelId),
    queryFn: async () => {
      const msgs = await api.request<Message[]>(
        `/channels/${channelId}/messages?limit=${pageSize}`,
      );
      return msgs as PendingMessage[];
    },
  });

  const fetchOlder = useCallback(() => {
    if (fetchingMore.current) return;
    const data = query.data;
    if (!data || data.length === 0) return;

    // The oldest loaded message is the last element in newest-first order
    const oldest = data[data.length - 1];
    if (!oldest) return;

    fetchingMore.current = true;

    api
      .request<Message[]>(
        `/channels/${channelId}/messages?limit=${pageSize}&before=${oldest.id}`,
      )
      .then((page) => {
        // The service fetches limit+1; only the first limit are usable
        // (the extra is for hasMore detection). Trim to pageSize.
        const usable = page.slice(0, pageSize) as PendingMessage[];
        applyPage(channelId, usable);
      })
      .catch(() => {
        // Silently ignore — next scroll will retry
      })
      .finally(() => {
        fetchingMore.current = false;
      });
  }, [channelId, pageSize, query.data]);

  // hasMore: if the last fetch returned exactly pageSize messages (or more
  // from the limit+1 behavior), there are likely more. The initial query
  // fetches pageSize but the service may return pageSize+1. We check the
  // initial load: if we got >= pageSize, there may be more.
  // After pagination, the applyPage writer doesn't track hasMore state
  // separately. We use query.dataUpdatedAt to detect when new pages arrive.
  const hasMore = query.data ? query.data.length >= pageSize : false;

  return {
    messages: query.data,
    isLoading: query.isLoading,
    isFetchingMore: fetchingMore.current,
    hasMore,
    fetchOlder,
  };
}
