/**
 * Unit tests for PresenceDot pure functions (FR-SOC-004).
 *
 * @satisfies FR-SOC-004
 */
import { presenceColor, presenceLabel } from '../PresenceDot';

describe('presenceColor (FR-SOC-004)', () => {
  it('returns green for ONLINE', () => {
    expect(presenceColor('ONLINE')).toBe('#23a55a');
  });

  it('returns red for DND', () => {
    expect(presenceColor('DND')).toBe('#da373c');
  });

  it('returns yellow for AWAY', () => {
    expect(presenceColor('AWAY')).toBe('#f0b232');
  });

  it('returns grey for INVISIBLE (treated as OFFLINE)', () => {
    expect(presenceColor('INVISIBLE')).toBe('#80848e');
  });

  it('returns grey for OFFLINE', () => {
    expect(presenceColor('OFFLINE')).toBe('#80848e');
  });

  it('returns grey for unknown status (OFFLINE fallback)', () => {
    expect(presenceColor('BOGUS')).toBe('#80848e');
  });
});

describe('presenceLabel (FR-SOC-004)', () => {
  it('returns "Online" for ONLINE', () => {
    expect(presenceLabel('ONLINE')).toBe('Online');
  });

  it('returns "Do Not Disturb" for DND', () => {
    expect(presenceLabel('DND')).toBe('Do Not Disturb');
  });

  it('returns "Away" for AWAY', () => {
    expect(presenceLabel('AWAY')).toBe('Away');
  });

  it('returns "Invisible" for INVISIBLE', () => {
    expect(presenceLabel('INVISIBLE')).toBe('Invisible');
  });

  it('returns "Offline" for OFFLINE', () => {
    expect(presenceLabel('OFFLINE')).toBe('Offline');
  });

  it('returns "Offline" for unknown status', () => {
    expect(presenceLabel('')).toBe('Offline');
  });
});
