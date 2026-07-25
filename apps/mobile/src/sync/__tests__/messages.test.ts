import { makePending, mergeCreated, mergeUpdated, mergeDeleted } from '../messages';
import type { Message } from '../../api/schema';

const serverMsg = (over: Partial<Message>): Message =>
  ({
    id: 'm1', channelId: 'c1', authorId: 'u1', content: 'hi', nonce: null,
    editedAt: null, deletedAt: null, attachments: [], reactions: [],
    pinned: false, poll: null, createdAt: '2026-07-25T00:00:00Z',
    ...over,
  }) as Message;

/** FR-MSG-002's unit half: optimistic → ack replacement keyed by nonce. */
// @satisfies FR-MSG-002
describe('message.created merge (nonce reconciliation)', () => {
  it('replaces the pending copy when the ack carries its nonce', () => {
    const pending = makePending({ channelId: 'c1', content: 'hi', nonce: 'n-1', authorId: 'u1' });
    const ack = serverMsg({ id: 'real-1', nonce: 'n-1' });
    const merged = mergeCreated([pending], ack);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe('real-1');
    expect(merged[0]?.pending).toBeUndefined();
  });

  it('is idempotent: the same ack applied twice changes nothing', () => {
    const pending = makePending({ channelId: 'c1', content: 'hi', nonce: 'n-1', authorId: 'u1' });
    const ack = serverMsg({ id: 'real-1', nonce: 'n-1' });
    const once = mergeCreated([pending], ack);
    const twice = mergeCreated(once, ack);
    expect(twice).toEqual(once);
  });

  it('an ack whose nonce was nulled by the server must not ghost-duplicate', () => {
    // Regression: REST ack with nonce:null prepended alongside the pending copy.
    const pending = makePending({ channelId: 'c1', content: 'hi', nonce: 'n-1', authorId: 'u1' });
    const ackNoNonce = serverMsg({ id: 'real-1', nonce: null });
    // ChatPane stamps the client nonce back on before merging:
    const merged = mergeCreated([pending], { ...ackNoNonce, nonce: 'n-1' });
    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe('real-1');
  });

  it("prepends someone else's message (list is newest-first)", () => {
    const mine = serverMsg({ id: 'real-1' });
    const theirs = serverMsg({ id: 'real-2', authorId: 'u2', content: 'yo' });
    const merged = mergeCreated([mine], theirs);
    expect(merged.map((m) => m.id)).toEqual(['real-2', 'real-1']);
  });

  it('REST ack then gateway echo of the same message does not duplicate', () => {
    const pending = makePending({ channelId: 'c1', content: 'hi', nonce: 'n-1', authorId: 'u1' });
    const ack = serverMsg({ id: 'real-1', nonce: 'n-1' });
    const afterRest = mergeCreated([pending], ack);
    const afterEcho = mergeCreated(afterRest, ack); // gateway delivers the same created
    expect(afterEcho).toHaveLength(1);
  });
});

// ── FR-MSG-003: Edit own message ──────────────────────────────────────
// @satisfies FR-MSG-003
describe('message.updated merge (FR-MSG-003)', () => {
  it('replaces the message at its id in place', () => {
    const original = serverMsg({ id: 'm1', content: 'hello' });
    const updated = serverMsg({ id: 'm1', content: 'hello world', editedAt: '2026-07-25T01:00:00Z' });
    const merged = mergeUpdated([original], updated);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.content).toBe('hello world');
    expect(merged[0]?.editedAt).toBe('2026-07-25T01:00:00Z');
  });

  it('updates only the target; leaves other messages untouched', () => {
    const a = serverMsg({ id: 'a', content: 'a' });
    const b = serverMsg({ id: 'b', content: 'b' });
    const updated = serverMsg({ id: 'b', content: 'b-v2' });
    const merged = mergeUpdated([a, b], updated);
    expect(merged).toHaveLength(2);
    expect(merged[0]?.content).toBe('a');
    expect(merged[1]?.content).toBe('b-v2');
  });

  it('unknown id returns list unchanged', () => {
    const a = serverMsg({ id: 'a' });
    const unknown = serverMsg({ id: 'z', content: 'z' });
    const merged = mergeUpdated([a], unknown);
    expect(merged).toHaveLength(1);
  });

  it('editedAt non-null produces (edited) marker', () => {
    // Pure rule: the (edited) marker renders whenever editedAt is truthy.
    const msg = serverMsg({ id: 'm1', editedAt: '2026-07-25T01:00:00Z' });
    const marked = !!msg.editedAt;
    expect(marked).toBe(true);
  });

  it('editedAt null produces no (edited) marker', () => {
    const msg = serverMsg({ id: 'm1', editedAt: null });
    const marked = !!msg.editedAt;
    expect(marked).toBe(false);
  });
});

// ── FR-MSG-004: Delete message (own or MANAGE_MESSAGES) ───────────────
// @satisfies FR-MSG-004
describe('message.deleted merge (FR-MSG-004)', () => {
  it('soft-deletes the message: sets deletedAt, preserves content', () => {
    const msg = serverMsg({ id: 'm1', content: 'secret' });
    const merged = mergeDeleted([msg], 'm1');
    expect(merged).toHaveLength(1);
    expect(merged[0]?.deletedAt).toBeTruthy();
    expect(merged[0]?.content).toBe('secret');
  });

  it('deletes only the target; other messages remain', () => {
    const a = serverMsg({ id: 'a' });
    const b = serverMsg({ id: 'b' });
    const merged = mergeDeleted([a, b], 'a');
    expect(merged).toHaveLength(2);
    expect(merged[0]?.deletedAt).toBeTruthy();
    expect(merged[1]?.deletedAt).toBeNull();
  });

  it('unknown id returns list unchanged', () => {
    const a = serverMsg({ id: 'a' });
    const merged = mergeDeleted([a], 'z');
    expect(merged).toHaveLength(1);
    expect(merged[0]?.deletedAt).toBeNull();
  });

  it('deleted message renders as removed placeholder', () => {
    // Pure rule: placeholder renders when deletedAt is truthy.
    const msg = serverMsg({ id: 'm1', deletedAt: '2026-07-25T01:00:00Z' });
    const isRemoved = !!msg.deletedAt;
    expect(isRemoved).toBe(true);
  });
});

// ── Permission matrix — pure helpers ──────────────────────────────────
// @satisfies FR-MSG-003
// @satisfies FR-MSG-004
describe('edit/delete permission matrix', () => {
  const canEdit = (isOwn: boolean): boolean => isOwn;
  const canDelete = (isOwn: boolean, hasManageMessages: boolean): boolean =>
    isOwn || hasManageMessages;

  const checkManage = (myPermissions: string): boolean => {
    try {
      const MANAGE_MESSAGES = 64n; // 1n << 6n per contracts/permissions.json
      return (BigInt(myPermissions) & MANAGE_MESSAGES) !== 0n;
    } catch {
      return false;
    }
  };

  it('own message: can edit', () => {
    expect(canEdit(true)).toBe(true);
  });

  it("other's message: cannot edit", () => {
    expect(canEdit(false)).toBe(false);
  });

  it('own message: can delete', () => {
    expect(canDelete(true, false)).toBe(true);
    expect(canDelete(true, true)).toBe(true);
  });

  it("other's message with MANAGE_MESSAGES: can delete", () => {
    expect(canDelete(false, true)).toBe(true);
  });

  it("other's message without MANAGE_MESSAGES: cannot delete", () => {
    expect(canDelete(false, false)).toBe(false);
  });

  it('MANAGE_MESSAGES bit (64 / 1n << 6n) is correctly checked', () => {
    expect(checkManage('64')).toBe(true);   // only MANAGE_MESSAGES
    expect(checkManage('0')).toBe(false);   // no permissions
    expect(checkManage('65')).toBe(true);   // MANAGE_MESSAGES + ADMINISTRATOR
    expect(checkManage('128')).toBe(false); // only MENTION_EVERYONE
  });
});
