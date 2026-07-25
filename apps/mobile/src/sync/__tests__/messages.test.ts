import { makePending, mergeCreated } from '../messages';
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
