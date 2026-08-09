import { describe, expect, it } from 'vitest';
import { clearContactLinkUrl, readContactLink } from './contactLink';

describe('OpenShare contact links', () => {
  it('accepts only complete friend codes and normalizes usernames', () => {
    expect(readContactLink('?friendCode=1234-5678&username=%40ada')).toEqual({ friendCode: '12345678', username: 'ada' });
    expect(readContactLink('?friendCode=123')).toEqual({ friendCode: '', username: '' });
  });

  it('removes contact fields without dropping unrelated callbacks or hashes', () => {
    expect(clearContactLinkUrl({ pathname: '/', search: '?friendCode=12345678&patreon=ok', hash: '#server' } as Location)).toBe('/?patreon=ok#server');
  });
});
