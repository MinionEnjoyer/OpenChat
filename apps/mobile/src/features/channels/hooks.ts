/**
 * Channel CRUD hooks (FR-SRV-005).
 *
 * Provides mutation hooks for create / edit / delete / reorder operations,
 * driving the server REST endpoints and invalidating the relevant query caches.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../stores/session';
import { keys } from '../../sync/keys';
import type { Channel } from '../../api/schema';

interface CreateChannelInput {
  name: string;
  type: 'TEXT' | 'VOICE';
  categoryId?: string;
}

interface UpdateChannelInput {
  name?: string;
  topic?: string | null;
  categoryId?: string | null;
}

export function useCreateChannel(serverId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateChannelInput) =>
      api.request<Channel>(`/servers/${serverId}/channels`, {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.channels(serverId) });
    },
  });
}

/** @satisfies FR-SRV-005 */
export function useUpdateChannel(serverId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ channelId, ...data }: { channelId: string } & UpdateChannelInput) =>
      api.request<Channel>(`/servers/${serverId}/channels/${channelId}`, {
        method: 'PATCH',
        body: data,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.channels(serverId) });
    },
  });
}

export function useDeleteChannel(serverId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (channelId: string) =>
      api.request<{ success: true }>(`/servers/${serverId}/channels/${channelId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.channels(serverId) });
    },
  });
}

/** @satisfies FR-SRV-005 — drives PATCH channels/reorder with exact payload shape */
export function useReorderChannels(serverId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderedIds: string[]) =>
      api.request<{ success: true }>(`/servers/${serverId}/channels/reorder`, {
        method: 'PATCH',
        body: { orderedIds },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.channels(serverId) });
    },
  });
}
