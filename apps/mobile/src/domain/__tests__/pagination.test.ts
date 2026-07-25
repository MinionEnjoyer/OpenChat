/**
 * Unit tests for domain/pagination.ts — FR-MSG-001
 *
 * Tests: page merge (no dupes/gaps, overlapping pages), day dividers,
 * author grouping at boundary values.
 *
 * // @satisfies FR-MSG-001
 */
import type { Message, Attachment, ReactionGroup, Poll } from '../../api/schema';
import { mergePage, insertDayDividers, computeAuthorGroups, type DayDivider } from '../pagination';

// ── Helpers ────────────────────────────────────────────────────────────

/** Full message shape for test construction (matches api/schema Message). */
interface TestMsg {
  id: string;
  channelId?: string;
  authorId?: string;
  content?: string;
  nonce?: string | null;
  editedAt?: string | null;
  deletedAt?: string | null;
  attachments?: Attachment[];
  reactions?: ReactionGroup[];
  pinned?: boolean;
  poll?: Poll | null;
  createdAt?: string;
}

function msg(over: Partial<TestMsg> & { id: string }): Message {
  return {
    id: over.id,
    channelId: over.channelId ?? 'c1',
    authorId: over.authorId ?? 'u1',
    content: over.content ?? 'hello',
    nonce: over.nonce ?? null,
    editedAt: over.editedAt ?? null,
    deletedAt: over.deletedAt ?? null,
    replyToId: (over as any).replyToId ?? null,
    replyTo: (over as any).replyTo ?? null,
    attachments: over.attachments ?? [],
    reactions: over.reactions ?? [],
    pinned: over.pinned ?? false,
    poll: over.poll ?? null,
    createdAt: over.createdAt ?? '2026-07-25T10:00:00.000Z',
  };
}

function div(date: string): DayDivider {
  return { kind: 'day-divider', date };
}

// ── Page merge ─────────────────────────────────────────────────────────
// @satisfies FR-MSG-001
describe('mergePage (FR-MSG-001)', () => {
  it('empty existing + incoming = incoming', () => {
    const incoming = [msg({ id: 'a', createdAt: '2026-07-25T10:00:00Z' })];
    expect(mergePage([], incoming)).toEqual(incoming);
  });

  it('existing + empty incoming = existing', () => {
    const existing = [msg({ id: 'a' })];
    expect(mergePage(existing, [])).toEqual(existing);
  });

  it('appends older page to existing (both newest-first)', () => {
    const existing = [
      msg({ id: 'm3', createdAt: '2026-07-25T10:00:03Z' }),
      msg({ id: 'm2', createdAt: '2026-07-25T10:00:02Z' }),
      msg({ id: 'm1', createdAt: '2026-07-25T10:00:01Z' }),
    ];
    const incoming = [
      msg({ id: 'm0', createdAt: '2026-07-25T10:00:00Z' }),
    ];
    const merged = mergePage(existing, incoming);
    expect(merged.map((m) => m.id)).toEqual(['m3', 'm2', 'm1', 'm0']);
  });

  it('dedup: overlapping message ids are not duplicated', () => {
    const existing = [
      msg({ id: 'm3' }),
      msg({ id: 'm2' }),
      msg({ id: 'm1' }),
    ];
    // Incoming includes m1 (overlap) + m0 (new)
    const incoming = [
      msg({ id: 'm1' }),
      msg({ id: 'm0' }),
    ];
    const merged = mergePage(existing, incoming);
    expect(merged.map((m) => m.id)).toEqual(['m3', 'm2', 'm1', 'm0']);
  });

  it('exact id sequences with no dupes/gaps across 3+ pages', () => {
    let list: Message[] = [];
    // Page 1: newest 3
    list = mergePage(list, [
      msg({ id: 'm9' }),
      msg({ id: 'm8' }),
      msg({ id: 'm7' }),
    ]);
    expect(list.map((m) => m.id)).toEqual(['m9', 'm8', 'm7']);

    // Page 2: next 3 older
    list = mergePage(list, [
      msg({ id: 'm6' }),
      msg({ id: 'm5' }),
      msg({ id: 'm4' }),
    ]);
    expect(list.map((m) => m.id)).toEqual(['m9', 'm8', 'm7', 'm6', 'm5', 'm4']);

    // Page 3: next 3 older
    list = mergePage(list, [
      msg({ id: 'm3' }),
      msg({ id: 'm2' }),
      msg({ id: 'm1' }),
    ]);
    expect(list.map((m) => m.id)).toEqual(['m9', 'm8', 'm7', 'm6', 'm5', 'm4', 'm3', 'm2', 'm1']);
  });

  it('full overlap: entire incoming page is already in existing', () => {
    const existing = [
      msg({ id: 'm3' }),
      msg({ id: 'm2' }),
      msg({ id: 'm1' }),
    ];
    const incoming = [
      msg({ id: 'm3' }),
      msg({ id: 'm2' }),
    ];
    const merged = mergePage(existing, incoming);
    expect(merged.map((m) => m.id)).toEqual(['m3', 'm2', 'm1']);
  });

  it('no overlap: completely disjoint id sets', () => {
    const existing = [
      msg({ id: 'b' }),
      msg({ id: 'a' }),
    ];
    const incoming = [
      msg({ id: 'd' }),
      msg({ id: 'c' }),
    ];
    const merged = mergePage(existing, incoming);
    expect(merged.map((m) => m.id)).toEqual(['b', 'a', 'd', 'c']);
  });
});

// ── Day dividers ───────────────────────────────────────────────────────
// @satisfies FR-MSG-001
describe('insertDayDividers (FR-MSG-001)', () => {
  it('empty list returns empty', () => {
    expect(insertDayDividers([])).toEqual([]);
  });

  it('single message: no divider', () => {
    const msgs = [msg({ id: 'm1', createdAt: '2026-07-25T10:00:00Z' })];
    expect(insertDayDividers(msgs)).toEqual(msgs);
  });

  it('same day: no divider between messages', () => {
    const msgs = [
      msg({ id: 'm3', createdAt: '2026-07-25T23:59:59Z' }),
      msg({ id: 'm2', createdAt: '2026-07-25T10:00:00Z' }),
      msg({ id: 'm1', createdAt: '2026-07-25T00:00:01Z' }),
    ];
    const result = insertDayDividers(msgs);
    expect(result).toHaveLength(3);
    expect(result.some((r) => 'kind' in r && (r as DayDivider).kind === 'day-divider')).toBe(false);
  });

  it('date boundary: divider inserted between different days', () => {
    const msgs = [
      msg({ id: 'm2', createdAt: '2026-07-25T23:59:59Z' }),
      msg({ id: 'm1', createdAt: '2026-07-24T00:00:01Z' }),
    ];
    const result = insertDayDividers(msgs);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual(msgs[0]);
    expect(result[1]).toEqual(div('2026-07-25'));
    expect(result[2]).toEqual(msgs[1]);
  });

  it('multi-day: dividers at each boundary', () => {
    const msgs = [
      msg({ id: 'm4', createdAt: '2026-07-27T10:00:00Z' }),
      msg({ id: 'm3', createdAt: '2026-07-26T10:00:00Z' }),
      msg({ id: 'm2', createdAt: '2026-07-26T09:00:00Z' }),
      msg({ id: 'm1', createdAt: '2026-07-25T10:00:00Z' }),
    ];
    const result = insertDayDividers(msgs);
    // Expected: m4, div(07-27), m3, m2, div(07-26), m1
    expect(result).toHaveLength(6);
    expect(result[0]).toEqual(msgs[0]); // m4
    expect(result[1]).toEqual(div('2026-07-27')); // divider after m4
    expect(result[2]).toEqual(msgs[1]); // m3
    expect(result[3]).toEqual(msgs[2]); // m2
    expect(result[4]).toEqual(div('2026-07-26')); // divider after m2
    expect(result[5]).toEqual(msgs[3]); // m1
  });
});

// ── Author grouping ────────────────────────────────────────────────────
// @satisfies FR-MSG-001
describe('computeAuthorGroups (FR-MSG-001)', () => {
  it('empty list returns empty', () => {
    expect(computeAuthorGroups([])).toEqual([]);
  });

  it('single message: shows author', () => {
    const msgs = [msg({ id: 'm1', authorId: 'u1' })];
    expect(computeAuthorGroups(msgs)).toEqual([true]);
  });

  it('different authors: both show header', () => {
    const msgs = [
      msg({ id: 'm2', authorId: 'u2', createdAt: '2026-07-25T10:00:10Z' }),
      msg({ id: 'm1', authorId: 'u1', createdAt: '2026-07-25T10:00:00Z' }),
    ];
    expect(computeAuthorGroups(msgs)).toEqual([true, true]);
  });

  it('same author within 7 min: second suppressed', () => {
    const msgs = [
      msg({ id: 'm2', authorId: 'u1', createdAt: '2026-07-25T10:07:00Z' }),
      msg({ id: 'm1', authorId: 'u1', createdAt: '2026-07-25T10:00:00Z' }),
    ];
    // 7 min apart = border case, should still suppress
    expect(computeAuthorGroups(msgs)).toEqual([true, false]);
  });

  it('same author at 6:59 apart: second suppressed', () => {
    const msgs = [
      msg({ id: 'm2', authorId: 'u1', createdAt: '2026-07-25T10:06:59Z' }),
      msg({ id: 'm1', authorId: 'u1', createdAt: '2026-07-25T10:00:00Z' }),
    ];
    expect(computeAuthorGroups(msgs)).toEqual([true, false]);
  });

  it('same author at 7:01 apart: second shows header', () => {
    const msgs = [
      msg({ id: 'm2', authorId: 'u1', createdAt: '2026-07-25T10:07:01Z' }),
      msg({ id: 'm1', authorId: 'u1', createdAt: '2026-07-25T10:00:00Z' }),
    ];
    expect(computeAuthorGroups(msgs)).toEqual([true, true]);
  });

  it('three messages: group of 2 then break', () => {
    const msgs = [
      msg({ id: 'm3', authorId: 'u1', createdAt: '2026-07-25T10:15:00Z' }),
      msg({ id: 'm2', authorId: 'u1', createdAt: '2026-07-25T10:08:00Z' }),
      msg({ id: 'm1', authorId: 'u1', createdAt: '2026-07-25T10:00:00Z' }),
    ];
    // m2-m1: 8min > 7, both show. m3-m2: 7min <= 7, m3 suppressed.
    expect(computeAuthorGroups(msgs)).toEqual([true, false, true]);
  });

  it('interleaved authors reset grouping', () => {
    const msgs = [
      msg({ id: 'm4', authorId: 'u1', createdAt: '2026-07-25T10:03:00Z' }),
      msg({ id: 'm3', authorId: 'u2', createdAt: '2026-07-25T10:02:00Z' }),
      msg({ id: 'm2', authorId: 'u1', createdAt: '2026-07-25T10:01:00Z' }),
      msg({ id: 'm1', authorId: 'u1', createdAt: '2026-07-25T10:00:00Z' }),
    ];
    // m2 groups with m1 (same author, 1min → suppress m1). m3 is different author. m4 isolated.
    expect(computeAuthorGroups(msgs)).toEqual([true, true, true, false]);
  });
});
