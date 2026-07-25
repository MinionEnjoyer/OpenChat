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
import { mergePage } from '../domain/pagination';

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
  replyToId?: string | null;
}): PendingMessage {
  return {
    id: `pending-${input.nonce}`,
    channelId: input.channelId,
    authorId: input.authorId,
    content: input.content,
    nonce: input.nonce,
    replyToId: input.replyToId ?? null,
    replyTo: null,
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

/**
 * Pure merge for an incoming message.updated (edits, deletes, reactions,
 * pins — the backend sends the complete message for all update types).
 * Delegates to domain/reactions.mergeMessageUpdate for field-level merging.
 * Unknown id is a no-op — the message will be fetched on-demand if needed.
 */
export function mergeUpdated(list: PendingMessage[] | undefined, incoming: Message): PendingMessage[] {
  const existing = list ?? [];
  const idx = existing.findIndex((m) => m.id === incoming.id);
  if (idx < 0) return existing;
  const next = [...existing];
  next[idx] = mergeMessageUpdate(existing[idx]!, incoming as PendingMessage);
  return next;
}

/**
 * Pure merge for an incoming message.deleted. Marks the message as soft-deleted
 * (FR-MSG-004). Unknown id is a no-op.
 */
export function mergeDeleted(list: PendingMessage[] | undefined, id: string): PendingMessage[] {
  const existing = list ?? [];
  const idx = existing.findIndex((m) => m.id === id);
  if (idx < 0) return existing;
  const next = [...existing];
  next[idx] = { ...next[idx], deletedAt: new Date().toISOString() } as PendingMessage;
  return next;
}

// ── Cache writers ──

export function applyCreated(incoming: Message): void {
  queryClient.setQueryData<PendingMessage[]>(messageKeys.list(incoming.channelId), (old) =>
    mergeCreated(old, incoming),
  );
}

/**
 * Apply a message.updated frame (edits, deletes, reactions, pins — the
 * backend sends the complete message for all update types). Delegates to
 * mergeUpdated, which merges via domain/reactions.mergeMessageUpdate.
 * If the message isn't cached, ignore — it will be fetched on-demand if the
 * user navigates to it.
 */
export function applyUpdated(incoming: Message): void {
  queryClient.setQueryData<PendingMessage[]>(messageKeys.list(incoming.channelId), (old) =>
    mergeUpdated(old, incoming),
  );
}

export function applyDeleted(channelId: string, id: string): void {
  queryClient.setQueryData<PendingMessage[]>(messageKeys.list(channelId), (old) =>
    mergeDeleted(old, id),
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
 * Apply an older page of messages to the cache. Merges via domain/pagination
 * mergePage (dedup by id, preserve newest-first order). FR-MSG-001.
 */
export function applyPage(channelId: string, incoming: Message[]): void {
  queryClient.setQueryData<PendingMessage[]>(messageKeys.list(channelId), (old) =>
    mergePage(old ?? [], incoming),
  );
}

/**
 * Replace the entire cache with a page centred on a target message (FR-MSG-016).
 * Used for ?around= pagination when jumping to a specific message.
 */
export function applyAround(channelId: string, incoming: Message[]): void {
  queryClient.setQueryData<PendingMessage[]>(messageKeys.list(channelId), incoming as PendingMessage[]);
}

// Re-export so screens depending on messages never inline key shapes.
export const keys = baseKeys;

/**
 * Factory for a synchronous send-in-flight guard. Returns { guard, release }
 * where guard(fn) executes fn exactly once until release() resets the lock.
 * This prevents duplicate sends when both onSubmitEditing and onPress fire
 * on a single user action (FR-MSG-002).
 *
 * DESIGN CHOICE: we keep both onSubmitEditing (keyboard Return) and onPress
 * (Send button) as legitimate UX paths and add a guard as defence in depth,
 * rather than removing either trigger. The guard is synchronous so both
 * handlers that fire in the same event-loop tick see busy=true after the
 * first one claims the lock.
 */
export function createSendGuard(): { guard: (fn: () => void) => boolean; release: () => void } {
  let busy = false;
  return {
    guard: (fn: () => void): boolean => {
      if (busy) return false;
      busy = true;
      fn();
      return true;
    },
    release: () => { busy = false; },
  };
}
