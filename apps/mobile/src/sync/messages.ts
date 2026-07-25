/**
 * Message cache operations (06 §3) — the only code that shapes the
 * ['messages', channelId] cache. List order is newest-first (E6). Optimistic
 * sends carry a client nonce; the gateway's message.created reconciles by
 * nonce (FR-MSG-002), everything else dedupes by id.
 */
import { queryClient } from './queryClient';
import { keys as baseKeys } from './keys';
import type { Message } from '../api/schema';
import { mergeMessageUpdate } from '../domain/reactions';

export const messageKeys = {
  list: (channelId: string) => ['messages', channelId] as const,
};

export interface PendingMessage extends Message {
  pending?: boolean;
}

export function makePending(input: {
  channelId: string;
  content: string;
  nonce: string;
  authorId: string;
}): PendingMessage {
  return {
    id: `pending-${input.nonce}`,
    channelId: input.channelId,
    authorId: input.authorId,
    content: input.content,
    nonce: input.nonce,
    editedAt: null,
    deletedAt: null,
    attachments: [],
    reactions: [],
    pinned: false,
    poll: null,
    createdAt: new Date().toISOString(),
    pending: true,
  } as PendingMessage;
}

/**
 * Pure merge for an incoming message.created. Nonce match replaces the
 * pending copy in place; a known id is a no-op; otherwise prepend (list is
 * newest-first).
 */
export function mergeCreated(list: PendingMessage[] | undefined, incoming: Message): PendingMessage[] {
  const existing = list ?? [];
  if (incoming.nonce) {
    const i = existing.findIndex((m) => m.nonce === incoming.nonce);
    if (i >= 0) {
      const next = [...existing];
      next[i] = incoming;
      return next;
    }
  }
  if (existing.some((m) => m.id === incoming.id)) return existing;
  return [incoming, ...existing];
}

// ── Cache writers ──

export function applyCreated(incoming: Message): void {
  queryClient.setQueryData<PendingMessage[]>(messageKeys.list(incoming.channelId), (old) =>
    mergeCreated(old, incoming),
  );
}

export function addPending(msg: PendingMessage): void {
  queryClient.setQueryData<PendingMessage[]>(messageKeys.list(msg.channelId), (old) => [
    msg,
    ...(old ?? []),
  ]);
}

export function removePending(channelId: string, nonce: string): void {
  queryClient.setQueryData<PendingMessage[]>(messageKeys.list(channelId), (old) =>
    (old ?? []).filter((m) => m.nonce !== nonce || !m.pending),
  );
}

/**
 * Apply a message.updated frame (reactions, edits, pins). The backend sends
 * the complete message; merge the incoming fields over the cached copy
 * (domain/reactions.mergeMessageUpdate). If the message isn't cached, ignore.
 */
export function applyUpdated(incoming: Message): void {
  queryClient.setQueryData<PendingMessage[]>(messageKeys.list(incoming.channelId), (old) => {
    if (!old) return old;
    const idx = old.findIndex((m) => m.id === incoming.id);
    if (idx < 0) return old;
    const next = [...old];
    next[idx] = mergeMessageUpdate(old[idx]!, incoming as PendingMessage);
    return next;
  });
}

// Re-export so screens depending on messages never inline key shapes.
export const keys = baseKeys;
