/**
 * FR-SOC-005 — Notifications inbox unit tests.
 *
 * Tests the pure domain helpers in inboxHelpers.ts.
 * Each test uses a fixture designed to catch a naive implementation
 * that would give the WRONG answer.
 *
 * @satisfies FR-SOC-005
 */
import { counts, validateNotificationsShape, findInviteByServer } from '../inboxHelpers';
import type { NotificationsResponse } from '../../../api/schema';

// ── Fixtures ──

/** A well-formed notification response. */
const fullFixture: NotificationsResponse = {
  friendRequests: [
    { id: 'fr-1', user: { id: 'u1', username: 'alice', displayName: 'Alice', avatarUrl: null, status: 'ONLINE', friendCode: null } },
  ],
  serverInvites: [
    {
      id: 'si-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      server: { id: 'srv-1', name: 'Test Server', iconUrl: null },
      inviter: { id: 'u2', username: 'bob', displayName: 'Bob', avatarUrl: null },
    },
    {
      id: 'si-2',
      createdAt: '2026-01-02T00:00:00.000Z',
      server: { id: 'srv-2', name: 'Other Server', iconUrl: null },
      inviter: { id: 'u3', username: 'charlie', displayName: null, avatarUrl: null },
    },
  ],
  count: 3, // 1 friendRequest + 2 serverInvites
};

/** Empty response — all zeros. */
const emptyFixture: NotificationsResponse = {
  friendRequests: [],
  serverInvites: [],
  count: 0,
};

/** Fixture where count is WRONG — naive code that trusts count would fail. */
const brokenCountFixture: NotificationsResponse = {
  friendRequests: [{ id: 'fr-1', user: { id: 'u1', username: 'alice', displayName: null, avatarUrl: null, status: 'ONLINE', friendCode: null } }],
  serverInvites: [],
  count: 99, // WRONG — should be 1
};

// ── Tests ──

describe('counts()', () => {
  // @satisfies FR-SOC-005
  it('splits full response correctly', () => {
    const result = counts(fullFixture);
    expect(result.frCount).toBe(1);
    expect(result.siCount).toBe(2);
  });

  // @satisfies FR-SOC-005
  it('handles empty response', () => {
    const result = counts(emptyFixture);
    expect(result.frCount).toBe(0);
    expect(result.siCount).toBe(0);
  });

  // @satisfies FR-SOC-005
  it('count from response matches sum of lengths, not a naive trust of count field', () => {
    // A naive implementation might return brokenCountFixture.count (99).
    // Our counts() derives from array lengths, not the count field.
    const result = counts(brokenCountFixture);
    // The actual sum is 1, not 99
    expect(result.frCount).toBe(1);
    expect(result.siCount).toBe(0);
    // This catches: result.frCount + result.siCount !== brokenCountFixture.count
    expect(result.frCount + result.siCount).toBe(1);
    expect(result.frCount + result.siCount).not.toBe(brokenCountFixture.count);
  });
});

describe('validateNotificationsShape()', () => {
  // @satisfies FR-SOC-005
  it('accepts well-formed response', () => {
    expect(() => validateNotificationsShape(fullFixture)).not.toThrow();
    const result = validateNotificationsShape(fullFixture);
    expect(result.count).toBe(3);
  });

  // @satisfies FR-SOC-005
  it('rejects bare array (naive implementation would crash)', () => {
    // This is the P0-10 contract: the endpoint must return an object, not a bare array.
    const bareArray = [
      { id: 'fr-1', user: {} },
    ];
    expect(() => validateNotificationsShape(bareArray)).toThrow(
      'Notifications response must be an object, not a bare array',
    );
  });

  // @satisfies FR-SOC-005
  it('rejects null', () => {
    expect(() => validateNotificationsShape(null)).toThrow(
      'Notifications response must be a non-null object',
    );
  });

  // @satisfies FR-SOC-005
  it('rejects missing friendRequests', () => {
    const bad = { serverInvites: [], count: 0 };
    expect(() => validateNotificationsShape(bad)).toThrow(
      'Notifications response missing friendRequests array',
    );
  });

  // @satisfies FR-SOC-005
  it('rejects missing serverInvites', () => {
    const bad = { friendRequests: [], count: 0 };
    expect(() => validateNotificationsShape(bad)).toThrow(
      'Notifications response missing serverInvites array',
    );
  });

  // @satisfies FR-SOC-005
  it('rejects wrong count (mismatch between count and sum of lengths)', () => {
    expect(() => validateNotificationsShape(brokenCountFixture)).toThrow(
      /Notifications count \(99\) does not match sum/,
    );
  });

  // @satisfies FR-SOC-005
  it('rejects missing count', () => {
    const bad = { friendRequests: [], serverInvites: [] };
    expect(() => validateNotificationsShape(bad)).toThrow(
      'Notifications response missing count (number)',
    );
  });
});

describe('findInviteByServer()', () => {
  // @satisfies FR-SOC-005
  it('finds invite by server id', () => {
    const result = findInviteByServer(fullFixture.serverInvites, 'srv-1');
    expect(result).toBeDefined();
    expect(result!.id).toBe('si-1');
    expect(result!.server.name).toBe('Test Server');
  });

  // @satisfies FR-SOC-005
  it('returns undefined when server not found', () => {
    const result = findInviteByServer(fullFixture.serverInvites, 'nonexistent');
    expect(result).toBeUndefined();
  });

  // @satisfies FR-SOC-005
  it('returns undefined for empty invites', () => {
    const result = findInviteByServer([], 'srv-1');
    expect(result).toBeUndefined();
  });
});
