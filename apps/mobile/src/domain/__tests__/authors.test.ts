// @satisfies FR-MSG-002
import { resolveAuthorName, type AuthorBrief } from '../authors';

const author = (overrides?: Partial<AuthorBrief>): AuthorBrief => ({
  id: 'author-1',
  username: 'bob',
  displayName: 'Bob',
  avatarUrl: null,
  status: 'ONLINE',
  ...overrides,
});

describe('resolveAuthorName (FR-MSG-002 message rendering)', () => {
  // @satisfies FR-MSG-002
  it('shows own display name for own message', () => {
    const name = resolveAuthorName(
      'user-1',
      author({ id: 'user-1', displayName: 'Alice', username: 'alice' }),
      'user-1',
      'Alice',
      'alice',
    );
    expect(name).toBe('Alice');
  });

  // @satisfies FR-MSG-002
  it('shows own username when displayName is null', () => {
    const name = resolveAuthorName(
      'user-1',
      undefined,
      'user-1',
      null,
      'alice',
    );
    expect(name).toBe('alice');
  });

  // @satisfies FR-MSG-002
  it('shows another member display name from embedded author', () => {
    const name = resolveAuthorName(
      'author-1',
      author({ displayName: 'Bob', username: 'bob' }),
      'user-1', // different current user
      'Alice',
      'alice',
    );
    expect(name).toBe('Bob');
  });

  // @satisfies FR-MSG-002
  it('falls back to author username when displayName is null', () => {
    const name = resolveAuthorName(
      'author-1',
      author({ displayName: null, username: 'bob' }),
      'user-1',
      'Alice',
      'alice',
    );
    expect(name).toBe('bob');
  });

  // @satisfies FR-MSG-002
  it('falls back to short id when author is undefined', () => {
    const name = resolveAuthorName(
      'de7bf295-0ccc-4e1b-8580-d386b370eb7a',
      undefined,
      'user-1',
      'Alice',
      'alice',
    );
    expect(name).toBe('de7bf295');
  });

  // @satisfies FR-MSG-002
  it('falls back to short id when author has no displayName or username', () => {
    const name = resolveAuthorName(
      'de7bf295-0ccc-4e1b-8580-d386b370eb7a',
      author({ displayName: null, username: '' }), // empty username
      'user-1',
      'Alice',
      'alice',
    );
    expect(name).toBe('de7bf295');
  });
});
