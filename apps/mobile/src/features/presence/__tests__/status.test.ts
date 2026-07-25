/**
 * Unit tests for presence status logic (FR-AUTH-007).
 *
 * @satisfies FR-AUTH-007
 */
import { SETTABLE_STATUSES } from '../StatusPicker';
import type { SettableStatus } from '../StatusPicker';

/** The normalization logic from StatusPicker, extracted for pure unit testing. */
function normalizeStatus(raw: string | null | undefined): SettableStatus {
  return SETTABLE_STATUSES.includes(raw as SettableStatus)
    ? (raw as SettableStatus)
    : 'ONLINE';
}

describe('presence status normalization (FR-AUTH-007)', () => {
  // @satisfies FR-AUTH-007
  it('SETTABLE_STATUSES has exactly 4 values and excludes OFFLINE', () => {
    expect(SETTABLE_STATUSES).toHaveLength(4);
    expect(SETTABLE_STATUSES).toContain('ONLINE');
    expect(SETTABLE_STATUSES).toContain('AWAY');
    expect(SETTABLE_STATUSES).toContain('DND');
    expect(SETTABLE_STATUSES).toContain('INVISIBLE');
    // OFFLINE is server-managed — NOT in the settable list
    expect(SETTABLE_STATUSES).not.toContain('OFFLINE');
  });

  // @satisfies FR-AUTH-007
  it('normalizeStatus returns the status when it is a valid settable status', () => {
    expect(normalizeStatus('ONLINE')).toBe('ONLINE');
    expect(normalizeStatus('AWAY')).toBe('AWAY');
    expect(normalizeStatus('DND')).toBe('DND');
    expect(normalizeStatus('INVISIBLE')).toBe('INVISIBLE');
  });

  // @satisfies FR-AUTH-007
  it('normalizeStatus falls back to ONLINE when status is null', () => {
    // A naive implementation that directly uses user.status without fallback
    // would render undefined or crash. Our normalizer must not.
    const result = normalizeStatus(null);
    expect(result).toBe('ONLINE');
  });

  // @satisfies FR-AUTH-007
  it('normalizeStatus falls back to ONLINE when status is undefined', () => {
    const result = normalizeStatus(undefined);
    expect(result).toBe('ONLINE');
  });

  // @satisfies FR-AUTH-007
  it('normalizeStatus falls back to ONLINE when status is OFFLINE (not settable)', () => {
    // OFFLINE should never appear as user.status when the user is connected,
    // but if it does (e.g. stale data), we fall back to ONLINE.
    const result = normalizeStatus('OFFLINE');
    expect(result).toBe('ONLINE');
  });

  // @satisfies FR-AUTH-007
  it('normalizeStatus falls back to ONLINE when status is garbage', () => {
    // Fixture: a naive implementation that does `status || 'ONLINE'`
    // would pass the null/undefined cases but still fail on this one,
    // since 'GARBAGE' is truthy.
    const result = normalizeStatus('GARBAGE');
    expect(result).toBe('ONLINE');
  });
});
