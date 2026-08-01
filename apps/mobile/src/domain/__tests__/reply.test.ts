/**
 * Unit tests for domain/reply.ts — FR-MSG-005
 *
 * // @satisfies FR-MSG-005
 */
import type { Message } from '../../api/schema';
import {
  resolveReplyPreview,
  truncateReplyContent,
  REPLY_PREVIEW_MAX_LENGTH,
  type ReplyPreview,
} from '../reply';

// ── Helpers ────────────────────────────────────────────────────────────

function msg(over: Partial<Message> & { id: string; author?: Message['author'] }): Message {
  return {
    id: over.id,
    kind: 'USER',
    channelId: over.channelId ?? 'c1',
    authorId: over.authorId ?? 'u1',
    author: over.author ?? undefined,
    content: over.content ?? 'hello',
    nonce: over.nonce ?? null,
    editedAt: over.editedAt ?? null,
    deletedAt: over.deletedAt ?? null,
    replyToId: over.replyToId ?? null,
    replyTo: over.replyTo ?? null,
    attachments: over.attachments ?? [],
    reactions: over.reactions ?? [],
    pinned: over.pinned ?? false,
    poll: over.poll ?? null,
    createdAt: over.createdAt ?? '2026-07-25T10:00:00.000Z',
  };
}

function cached(name: string, id?: string): Message {
  return msg({
    id: id ?? `msg-${name}`,
    authorId: `author-${name}`,
    content: `content from ${name}`,
    author: {
      id: `author-${name}`,
      username: name,
      displayName: `Display ${name}`,
      avatarUrl: null,
      status: null,
      isBot: false,
    },
  });
}

// ── resolveReplyPreview ────────────────────────────────────────────────

describe('resolveReplyPreview (FR-MSG-005)', () => {
  it('returns null when replyToId is null', () => {
    const m = msg({ id: 'm1', replyToId: null });
    expect(resolveReplyPreview(m, [])).toBeNull();
  });

  it('returns null when replyToId is undefined (not set)', () => {
    const m = msg({ id: 'm1', replyToId: undefined as unknown as null });
    expect(resolveReplyPreview(m, [])).toBeNull();
  });

  it('uses server-embedded replyTo when present', () => {
    const m = msg({
      id: 'm1',
      replyToId: 'target-1',
      replyTo: { id: 'target-1', authorName: 'Alice', content: 'original text' },
    });
    const result = resolveReplyPreview(m, []);
    expect(result).toEqual({
      found: true,
      id: 'target-1',
      authorName: 'Alice',
      content: 'original text',
    });
  });

  it('server-embedded replyTo takes priority over cache lookup', () => {
    const m = msg({
      id: 'm1',
      replyToId: 'target-1',
      replyTo: { id: 'target-1', authorName: 'Alice', content: 'from server' },
    });
    const cache = [
      msg({ id: 'target-1', content: 'from cache', author: { id: 'a1', username: 'bob', displayName: 'Bob', avatarUrl: null, status: null, isBot: false } }),
    ];
    const result = resolveReplyPreview(m, cache);
    expect(result).toEqual({
      found: true,
      id: 'target-1',
      authorName: 'Alice',
      content: 'from server',
    });
  });

  it('falls back to cached message when no server-embedded replyTo', () => {
    const m = msg({ id: 'm1', replyToId: 'target-1', replyTo: null });
    const target = msg({
      id: 'target-1',
      content: 'Hello from the cache!',
      author: { id: 'a1', username: 'alice', displayName: 'Alice', avatarUrl: null, status: null, isBot: false },
    });
    const result = resolveReplyPreview(m, [target]);
    expect(result).toEqual({
      found: true,
      id: 'target-1',
      authorName: 'Alice',
      content: 'Hello from the cache!',
    });
  });

  it('uses displayName over username from cached author', () => {
    const m = msg({ id: 'm1', replyToId: 'target-1', replyTo: null });
    const target = msg({
      id: 'target-1',
      content: 'text',
      author: { id: 'a1', username: 'alice99', displayName: 'Alice', avatarUrl: null, status: null, isBot: false },
    });
    const result = resolveReplyPreview(m, [target]);
    expect(result).toEqual({
      found: true,
      id: 'target-1',
      authorName: 'Alice',
      content: 'text',
    });
  });

  it('falls back to username when displayName is null', () => {
    const m = msg({ id: 'm1', replyToId: 'target-1', replyTo: null });
    const target = msg({
      id: 'target-1',
      content: 'text',
      author: { id: 'a1', username: 'alice99', displayName: null, avatarUrl: null, status: null, isBot: false },
    });
    const result = resolveReplyPreview(m, [target]);
    expect(result).toEqual({
      found: true,
      id: 'target-1',
      authorName: 'alice99',
      content: 'text',
    });
  });

  it('falls back to authorId prefix when no author embed', () => {
    const m = msg({ id: 'm1', replyToId: 'target-1', replyTo: null });
    const target = msg({ id: 'target-1', content: 'text', author: undefined, authorId: 'abcdef123456' });
    const result = resolveReplyPreview(m, [target]);
    expect(result).toEqual({
      found: true,
      id: 'target-1',
      authorName: 'abcdef12',
      content: 'text',
    });
  });

  it('returns not-found when target is not in cache and no server replyTo', () => {
    const m = msg({ id: 'm1', replyToId: 'target-1', replyTo: null });
    const result = resolveReplyPreview(m, []);
    expect(result).toEqual({ found: false, id: 'target-1' });
  });

  it('finds target in a multi-message cache (newest-first)', () => {
    const m = msg({ id: 'm1', replyToId: 'target-mid', replyTo: null });
    const cache = [
      cached('newest', 'new-1'),
      cached('middle', 'target-mid'),
      cached('oldest', 'old-1'),
    ];
    const result = resolveReplyPreview(m, cache);
    expect(result).toEqual({
      found: true,
      id: 'target-mid',
      authorName: 'Display middle',
      content: 'content from middle',
    });
  });
});

// ── truncateReplyContent ───────────────────────────────────────────────

describe('truncateReplyContent (FR-MSG-005)', () => {
  it('returns content unchanged when under limit', () => {
    expect(truncateReplyContent('short', 120)).toBe('short');
  });

  it('returns content unchanged when exactly at limit', () => {
    const s = 'a'.repeat(120);
    expect(truncateReplyContent(s, 120)).toBe(s);
  });

  it('truncates long content and appends ellipsis', () => {
    const s = 'a'.repeat(200);
    const result = truncateReplyContent(s, 120);
    expect(result.length).toBe(121); // 120 chars + ellipsis
    expect(result).toBe('a'.repeat(120) + '\u2026');
  });

  it('uses REPLY_PREVIEW_MAX_LENGTH as default', () => {
    const s = 'a'.repeat(REPLY_PREVIEW_MAX_LENGTH + 1);
    const result = truncateReplyContent(s);
    expect(result.length).toBe(REPLY_PREVIEW_MAX_LENGTH + 1);
    expect(result.endsWith('\u2026')).toBe(true);
  });

  it('handles empty string', () => {
    expect(truncateReplyContent('')).toBe('');
  });
});

// ── Type guards (pure logic tests) ─────────────────────────────────────

describe('ReplyPreview discriminated union (FR-MSG-005)', () => {
  function renderPreview(p: ReplyPreview): string {
    if (p.found) {
      return `${p.authorName}: ${p.content}`;
    }
    return `[not found: ${p.id}]`;
  }

  it('found branch includes author and content', () => {
    const p: ReplyPreview = { found: true, id: 'm1', authorName: 'A', content: 'hi' };
    expect(renderPreview(p)).toBe('A: hi');
  });

  it('not-found branch renders fallback', () => {
    const p: ReplyPreview = { found: false, id: 'm1' };
    expect(renderPreview(p)).toBe('[not found: m1]');
  });
});

// ── Cancel-reply: clearing state produces null preview ──────────────────

describe('cancel-reply clears state (FR-MSG-005)', () => {
  it('a message with replyToId=null produces null preview', () => {
    // Simulating: user sets replyTarget, then cancels → replyToId=null on send.
    const m = msg({ id: 'm1', replyToId: null });
    expect(resolveReplyPreview(m, [])).toBeNull();
  });
});
