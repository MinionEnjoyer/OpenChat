// @satisfies FR-NOTIF-003
import {
  getSetting,
  computeMutedUntil,
  effectiveLevel,
  levelLabel,
} from '../notifSettings';
import type { NotificationSetting } from '../../../api/schema';

function makeSetting(overrides: Partial<NotificationSetting> = {}): NotificationSetting {
  return {
    id: 'ns-1',
    userId: 'user-1',
    scope: 'SERVER',
    scopeId: 'server-1',
    level: 'ALL',
    mutedUntil: null,
    ...overrides,
  };
}

// ── getSetting ──

describe('getSetting (scope+scopeId lookup)', () => {
  it('returns the matching setting when scope and scopeId both match', () => {
    const settings = [
      makeSetting({ id: 'a', scope: 'SERVER', scopeId: 'srv-1' }),
      makeSetting({ id: 'b', scope: 'CHANNEL', scopeId: 'ch-1' }),
    ];
    const found = getSetting(settings, 'SERVER', 'srv-1');
    expect(found?.id).toBe('a');
  });

  it('returns undefined when no setting matches', () => {
    const settings: NotificationSetting[] = [];
    expect(getSetting(settings, 'SERVER', 'any')).toBeUndefined();
  });

  /**
   * BUG-CATCHER: A naive implementation that only matches on scopeId (ignoring scope)
   * would return the wrong setting when a server and channel happen to share an ID.
   */
  it('distinguishes SERVER from CHANNEL for the same scopeId', () => {
    const settings = [
      makeSetting({ id: 'server-ns', scope: 'SERVER', scopeId: 'shared-id' }),
      makeSetting({ id: 'channel-ns', scope: 'CHANNEL', scopeId: 'shared-id' }),
    ];
    expect(getSetting(settings, 'SERVER', 'shared-id')?.id).toBe('server-ns');
    expect(getSetting(settings, 'CHANNEL', 'shared-id')?.id).toBe('channel-ns');
  });
});

// ── computeMutedUntil ──

describe('computeMutedUntil (mute duration → ISO date)', () => {
  it('returns null for "forever" (ms === null)', () => {
    expect(computeMutedUntil(null)).toBeNull();
  });

  it('returns a future ISO string for a positive duration', () => {
    const before = Date.now() + 15 * 60_000;
    const result = computeMutedUntil(15 * 60_000);
    expect(result).not.toBeNull();
    const date = new Date(result!);
    // Should be within a few seconds of the expected time
    expect(date.getTime()).toBeGreaterThan(before - 5000);
    expect(date.getTime()).toBeLessThan(before + 5000);
  });

  /**
   * BUG-CATCHER: A naive implementation that always does Date.now() + ms
   * without checking for null would produce a past-or-present date instead of null.
   * Date.now() + null = Date.now(), which would set a "muted until now" effectively unmuting.
   */
  it('never returns a Date when ms is null (naive Date.now()+null = Date.now!)', () => {
    // If someone did `new Date(Date.now() + (ms ?? 0))` for null, they'd get now.
    // Our implementation must return null for null input.
    const result = computeMutedUntil(null);
    expect(result).toBeNull();
  });
});

// ── effectiveLevel ──

describe('effectiveLevel (default-fallback)', () => {
  it('returns the level from the setting when present', () => {
    const setting = makeSetting({ level: 'NONE' });
    expect(effectiveLevel(setting)).toBe('NONE');
  });

  it('defaults to ALL when no setting exists', () => {
    expect(effectiveLevel(undefined)).toBe('ALL');
  });
});

// ── levelLabel ──

describe('levelLabel', () => {
  it.each([
    ['ALL', 'All'],
    ['MENTIONS', 'Mentions'],
    ['NONE', 'None'],
  ] as const)('maps %s → %s', (level, expected) => {
    expect(levelLabel(level)).toBe(expected);
  });
});
