// @satisfies FR-MSG-010
/**
 * Exhaustive unit tests for domain/unread.ts (FR-MSG-010).
 *
 * Covers: no read state | read state newer than all messages | exactly at
 * boundary | mentions counted separately | own messages excluded | deleted
 * messages excluded | empty channel | null lastReadMessageId | read state
 * pointing to absent message (e.g. deleted from loaded page).
 */

import { computeChannelUnread, ChannelUnread, MessageMeta, ReadState } from '../unread';

// ── Test helpers ──

const CH = 'ch-1';
const ME = 'user-me';
const OTHER = 'user-other';

/** Create a visible (non-deleted, other-authored) message. */
function msg(id: string, mentionsUser = false): MessageMeta {
  return { id, channelId: CH, authorId: OTHER, mentionsUser, deleted: false };
}

/** Create a deleted message. */
function deleted(id: string): MessageMeta {
  return { id, channelId: CH, authorId: OTHER, mentionsUser: false, deleted: true };
}

/** Create a message authored by the current user. */
function own(id: string): MessageMeta {
  return { id, channelId: CH, authorId: ME, mentionsUser: false, deleted: false };
}

/** A mention message. */
function mention(id: string): MessageMeta {
  return msg(id, true);
}

function rs(lastReadMessageId: string | null): ReadState {
  return { channelId: CH, lastReadMessageId };
}

// ── Table-driven tests ──

interface TestCase {
  name: string;
  readState: ReadState | undefined;
  messages: MessageMeta[];
  expected: ChannelUnread;
  readStateIsAhead?: boolean;
}

const cases: TestCase[] = [
  // ── Empty channel ──
  {
    name: 'empty channel',
    readState: undefined,
    messages: [],
    expected: { channelId: CH, unread: 0, mentionCount: 0, dividerMessageId: null },
    readStateIsAhead: true,
  },
  {
    name: 'empty channel with read state',
    readState: rs('m2'),
    messages: [],
    expected: { channelId: CH, unread: 0, mentionCount: 0, dividerMessageId: null },
    readStateIsAhead: true,
  },

  // ── No read state at all ──
  {
    name: 'no read state — all messages unread',
    readState: undefined,
    messages: [msg('m1'), msg('m2'), msg('m3')],
    expected: { channelId: CH, unread: 3, mentionCount: 0, dividerMessageId: null },
  },

  // ── Read state newer than all messages ──
  {
    name: 'read state newer than all messages',
    readState: rs('m9'),
    messages: [msg('m1'), msg('m2'), msg('m3')],
    expected: { channelId: CH, unread: 0, mentionCount: 0, dividerMessageId: null },
    readStateIsAhead: true,
  },

  // ── Exactly at boundary ──
  {
    name: 'exactly at first message — rest unread',
    readState: rs('m1'),
    messages: [msg('m1'), msg('m2'), msg('m3')],
    expected: { channelId: CH, unread: 2, mentionCount: 0, dividerMessageId: 'm1' },
  },
  {
    name: 'exactly at middle message',
    readState: rs('m2'),
    messages: [msg('m1'), msg('m2'), msg('m3'), msg('m4'), msg('m5')],
    expected: { channelId: CH, unread: 3, mentionCount: 0, dividerMessageId: 'm2' },
  },
  {
    name: 'exactly at last message — nothing unread',
    readState: rs('m3'),
    messages: [msg('m1'), msg('m2'), msg('m3')],
    expected: { channelId: CH, unread: 0, mentionCount: 0, dividerMessageId: null },
    readStateIsAhead: true,
  },

  // ── Mentions counted separately from plain unread ──
  {
    name: 'mentions in unread region',
    readState: rs('m2'),
    messages: [msg('m1'), msg('m2'), mention('m3'), msg('m4'), mention('m5')],
    expected: { channelId: CH, unread: 3, mentionCount: 2, dividerMessageId: 'm2' },
  },
  {
    name: 'mentions before read boundary not counted',
    readState: rs('m3'),
    messages: [mention('m1'), msg('m2'), msg('m3'), msg('m4')],
    expected: { channelId: CH, unread: 1, mentionCount: 0, dividerMessageId: 'm3' },
  },
  {
    name: 'all unread messages are mentions',
    readState: rs('m1'),
    messages: [msg('m1'), mention('m2'), mention('m3')],
    expected: { channelId: CH, unread: 2, mentionCount: 2, dividerMessageId: 'm1' },
  },

  // ── Own messages not counted unread ──
  {
    name: 'own messages excluded from unread count',
    readState: undefined,
    messages: [msg('m1'), own('m2'), msg('m3')],
    expected: { channelId: CH, unread: 2, mentionCount: 0, dividerMessageId: null },
  },
  {
    name: 'own messages excluded with read boundary',
    readState: rs('m1'),
    messages: [msg('m1'), own('m2'), msg('m3'), own('m4'), msg('m5')],
    expected: { channelId: CH, unread: 2, mentionCount: 0, dividerMessageId: 'm1' },
  },
  {
    name: 'channel with only own messages — zero unread',
    readState: undefined,
    messages: [own('m1'), own('m2'), own('m3')],
    expected: { channelId: CH, unread: 0, mentionCount: 0, dividerMessageId: null },
    readStateIsAhead: true,
  },

  // ── Deleted messages excluded ──
  {
    name: 'deleted messages excluded from unread count',
    readState: undefined,
    messages: [msg('m1'), deleted('m2'), msg('m3')],
    expected: { channelId: CH, unread: 2, mentionCount: 0, dividerMessageId: null },
  },
  {
    name: 'deleted messages excluded with boundary',
    readState: rs('m1'),
    messages: [msg('m1'), deleted('d1'), msg('m3'), deleted('d2'), msg('m5')],
    expected: { channelId: CH, unread: 2, mentionCount: 0, dividerMessageId: 'm1' },
  },

  // ── Read state is the boundary message itself (it IS read) ──
  {
    name: 'boundary message itself is NOT unread',
    readState: rs('m2'),
    messages: [msg('m1'), msg('m2'), msg('m3')],
    expected: { channelId: CH, unread: 1, mentionCount: 0, dividerMessageId: 'm2' },
  },

  // ── Null lastReadMessageId (user opened channel but read nothing) ──
  {
    name: 'null lastReadMessageId — all messages unread',
    readState: rs(null),
    messages: [msg('m1'), msg('m2'), msg('m3')],
    expected: { channelId: CH, unread: 3, mentionCount: 0, dividerMessageId: null },
  },

  // ── Read state points to a message not in the loaded list ──
  {
    name: 'read state points to absent message — all unread',
    readState: rs('nonexistent'),
    messages: [msg('m1'), msg('m2'), msg('m3')],
    expected: { channelId: CH, unread: 3, mentionCount: 0, dividerMessageId: null },
  },

  // ── Combined: own + deleted + mentions ──
  {
    name: 'combined: own, deleted, and mentions',
    readState: rs('m2'),
    messages: [
      msg('m1'),
      msg('m2'),         // ← boundary
      own('o1'),         // own, excluded
      deleted('d1'),     // deleted, excluded
      mention('m3'),     // unread mention
      msg('m4'),         // unread
      mention('m5'),     // unread mention
    ],
    expected: { channelId: CH, unread: 3, mentionCount: 2, dividerMessageId: 'm2' },
  },

  // ── Different channelId — all filtered out ──
  {
    name: 'messages from other channels excluded',
    readState: undefined,
    messages: [
      { id: 'm1', channelId: 'other-ch', authorId: OTHER, mentionsUser: false, deleted: false },
    ],
    expected: { channelId: CH, unread: 0, mentionCount: 0, dividerMessageId: null },
    readStateIsAhead: true,
  },
];

// ── Run ──

describe('computeChannelUnread (FR-MSG-010)', () => {
  it.each(cases)('$name', ({ readState, messages, expected, readStateIsAhead }) => {
    const result = computeChannelUnread(CH, readState, messages, ME, { readStateIsAhead });
    expect(result).toEqual(expected);
  });
});
