import { describe, expect, it } from 'vitest';
import { clearPatreonCallbackUrl, readPatreonCallback } from './patreonInvite';

describe('Patreon callback navigation', () => {
  it('reads the one-use invitation and preserves unrelated URL state when cleaning up', () => {
    expect(readPatreonCallback('?patreonInvite=abc123&view=compact')).toEqual({
      inviteCode: 'abc123',
      error: null,
    });
    expect(clearPatreonCallbackUrl({
      pathname: '/',
      search: '?patreonInvite=abc123&view=compact',
      hash: '#channel-1',
    })).toBe('/?view=compact#channel-1');
  });

  it('reads a sanitized callback error', () => {
    expect(readPatreonCallback('?patreonError=Membership+required')).toEqual({
      inviteCode: null,
      error: 'Membership required',
    });
  });
});
