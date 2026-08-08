import {
  canonicalJson, signFederationEnvelope, signaturesMatch,
} from './federation.types';
import type { FederationEnvelope } from './federation.types';

const envelope: FederationEnvelope = {
  id: '6c02a6be-c63f-447a-8eca-4793690937bd',
  originNodeId: 'east',
  eventType: 'MESSAGE_DELETED',
  aggregateId: 'message-1',
  occurredAt: '2026-08-08T07:00:00.000Z',
  payload: { channelId: 'channel-1', id: 'message-1' },
};

describe('federation envelope authentication', () => {
  it('canonicalizes object keys recursively', () => {
    expect(canonicalJson({ z: 1, nested: { b: 2, a: 1 }, a: 0 }))
      .toBe('{"a":0,"nested":{"a":1,"b":2},"z":1}');
  });

  it('produces deterministic, content-bound signatures', () => {
    const first = signFederationEnvelope('a'.repeat(32), '1700000000000', envelope);
    const reordered = signFederationEnvelope('a'.repeat(32), '1700000000000', {
      ...envelope,
      payload: { id: 'message-1', channelId: 'channel-1' },
    });
    const changed = signFederationEnvelope('a'.repeat(32), '1700000000000', {
      ...envelope,
      aggregateId: 'message-2',
    });

    expect(signaturesMatch(first, reordered)).toBe(true);
    expect(signaturesMatch(first, changed)).toBe(false);
    expect(signaturesMatch(first, 'short')).toBe(false);
  });
});
