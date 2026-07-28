// @satisfies FR-SOC-007
import { useBlockedStore } from '../useBlockedStore';

/**
 * Unit tests for the blocked-user store (FR-SOC-007).
 * Tests that the store correctly fetches blocked user IDs and
 * exposes a Set for O(1) lookup.
 */

describe('useBlockedStore (FR-SOC-007)', () => {
  beforeEach(() => {
    useBlockedStore.setState({ blockedIds: new Set(), fetched: false });
    jest.restoreAllMocks();
  });

  // @satisfies FR-SOC-007
  it('starts with empty set and fetched=false', () => {
    const s = useBlockedStore.getState();
    expect(s.fetched).toBe(false);
    expect(s.blockedIds.size).toBe(0);
  });

  // @satisfies FR-SOC-007
  it('fetch populates blockedIds from API response', async () => {
    const mockUsers = [
      { id: 'blocked-a', username: 'spammer1', displayName: null, avatarUrl: null, status: 'OFFLINE' },
      { id: 'blocked-b', username: 'spammer2', displayName: 'Troll', avatarUrl: null, status: 'OFFLINE' },
    ];

    global.fetch = jest.fn(async (_url: string) => ({
      status: 200,
      text: async () => JSON.stringify(mockUsers),
    })) as unknown as typeof fetch;

    await useBlockedStore.getState().fetch();

    const s = useBlockedStore.getState();
    expect(s.fetched).toBe(true);
    expect(s.blockedIds.size).toBe(2);
    expect(s.blockedIds.has('blocked-a')).toBe(true);
    expect(s.blockedIds.has('blocked-b')).toBe(true);
    expect(s.blockedIds.has('unknown')).toBe(false);
  });

  // @satisfies FR-SOC-007
  it('sets fetched=true even when the API call fails (fail-safe)', async () => {
    global.fetch = jest.fn(async () => ({
      status: 500,
      text: async () => JSON.stringify({}),
    })) as unknown as typeof fetch;

    await useBlockedStore.getState().fetch();

    const s = useBlockedStore.getState();
    expect(s.fetched).toBe(true);
    expect(s.blockedIds.size).toBe(0); // No false positives
  });

  // @satisfies FR-SOC-007
  it('fetch replaces previous blockedIds on subsequent calls', async () => {
    useBlockedStore.setState({ blockedIds: new Set(['old-id']), fetched: true });

    const mockUsers = [
      { id: 'new-id', username: 'new', displayName: null, avatarUrl: null, status: 'OFFLINE' },
    ];

    global.fetch = jest.fn(async (_url: string) => ({
      status: 200,
      text: async () => JSON.stringify(mockUsers),
    })) as unknown as typeof fetch;

    await useBlockedStore.getState().fetch();

    const s = useBlockedStore.getState();
    expect(s.blockedIds.has('old-id')).toBe(false);
    expect(s.blockedIds.has('new-id')).toBe(true);
  });
});
