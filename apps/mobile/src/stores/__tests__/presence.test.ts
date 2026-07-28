/**
 * Unit tests for the presence store (FR-SOC-004).
 *
 * @satisfies FR-SOC-004
 */
import { usePresence } from '../presence';

describe('presence store (FR-SOC-004)', () => {
  beforeEach(() => {
    usePresence.setState({ presenceMap: {} });
  });

  // ── setPresence ─────────────────────────────────────────────────────

  it('records an ONLINE status', () => {
    usePresence.getState().setPresence('u1', 'ONLINE');
    expect(usePresence.getState().getStatus('u1')).toBe('ONLINE');
  });

  it('records all statuses: AWAY, DND', () => {
    usePresence.getState().setPresence('u1', 'AWAY');
    expect(usePresence.getState().getStatus('u1')).toBe('AWAY');
    usePresence.getState().setPresence('u2', 'DND');
    expect(usePresence.getState().getStatus('u2')).toBe('DND');
  });

  it('converts INVISIBLE to OFFLINE (defense-in-depth)', () => {
    // FR-SOC-004: invisible reads as offline to peers.
    // The server masks this; the store does it again.
    usePresence.getState().setPresence('u1', 'INVISIBLE');
    expect(usePresence.getState().getStatus('u1')).toBe('OFFLINE');
  });

  it('updates presence on second call (ONLINE → AWAY)', () => {
    usePresence.getState().setPresence('u1', 'ONLINE');
    usePresence.getState().setPresence('u1', 'AWAY');
    expect(usePresence.getState().getStatus('u1')).toBe('AWAY');
  });

  // ── getStatus (default) ─────────────────────────────────────────────

  it('returns OFFLINE for unknown userId', () => {
    expect(usePresence.getState().getStatus('never-seen')).toBe('OFFLINE');
  });

  // ── isOnline ────────────────────────────────────────────────────────

  it('isOnline: ONLINE → true', () => {
    usePresence.getState().setPresence('u1', 'ONLINE');
    expect(usePresence.getState().isOnline('u1')).toBe(true);
  });

  it('isOnline: DND → true', () => {
    usePresence.getState().setPresence('u1', 'DND');
    expect(usePresence.getState().isOnline('u1')).toBe(true);
  });

  it('isOnline: AWAY → true', () => {
    usePresence.getState().setPresence('u1', 'AWAY');
    expect(usePresence.getState().isOnline('u1')).toBe(true);
  });

  it('isOnline: INVISIBLE → false', () => {
    // INVISIBLE gets mapped to OFFLINE, so isOnline is false.
    usePresence.getState().setPresence('u1', 'INVISIBLE');
    expect(usePresence.getState().isOnline('u1')).toBe(false);
  });

  it('isOnline: OFFLINE → false', () => {
    usePresence.getState().setPresence('u1', 'OFFLINE');
    expect(usePresence.getState().isOnline('u1')).toBe(false);
  });

  it('isOnline: unknown → false', () => {
    expect(usePresence.getState().isOnline('never-seen')).toBe(false);
  });

  // ── Multiple users ──────────────────────────────────────────────────

  it('tracks multiple users independently', () => {
    usePresence.getState().setPresence('u1', 'ONLINE');
    usePresence.getState().setPresence('u2', 'AWAY');
    usePresence.getState().setPresence('u3', 'DND');
    expect(usePresence.getState().getStatus('u1')).toBe('ONLINE');
    expect(usePresence.getState().getStatus('u2')).toBe('AWAY');
    expect(usePresence.getState().getStatus('u3')).toBe('DND');
  });

  it('one user update does not affect others', () => {
    usePresence.getState().setPresence('u1', 'ONLINE');
    usePresence.getState().setPresence('u2', 'ONLINE');
    usePresence.getState().setPresence('u1', 'AWAY');
    expect(usePresence.getState().getStatus('u1')).toBe('AWAY');
    expect(usePresence.getState().getStatus('u2')).toBe('ONLINE');
  });

  // ── This test MUST catch a naive implementation that returns "true"
  //    for any non-empty status. Perturb it by changing isOnline's
  //    threshold to verify the test can fail. ───────────────────────────
  it('isOnline returns false for OFFLINE (prove-it-can-fail)', () => {
    usePresence.getState().setPresence('u1', 'OFFLINE');
    // A naive impl might check `status !== 'OFFLINE'` which would be
    // wrong for INVISIBLE (our store already maps INVISIBLE → OFFLINE).
    // But the point is: OFFLINE itself must be false.
    expect(usePresence.getState().isOnline('u1')).toBe(false);
  });
});
