// @satisfies FR-MSG-009
import { useTyping } from '../typing';
import { setClock, resetClock, createFrozenClock } from '../../lib/clock';

const CH = 'channel-1';

describe('typing store (FR-MSG-009)', () => {
  beforeEach(() => {
    useTyping.setState({ typists: {}, lastSent: {}, activeTimers: {} });
    resetClock();
  });

  afterEach(() => {
    resetClock();
  });

  // ── recordTyping + getActiveTypistIds ──────────────────────────────

  it('recordTyping adds a typist and getActiveTypistIds returns them', () => {
    useTyping.getState().recordTyping(CH, 'u1');
    const active = useTyping.getState().getActiveTypistIds(CH, 'u2');
    expect(active).toEqual(['u1']);
  });

  it('getActiveTypistIds excludes the given userId (own typing not shown)', () => {
    useTyping.getState().recordTyping(CH, 'u1');
    useTyping.getState().recordTyping(CH, 'u2');
    const active = useTyping.getState().getActiveTypistIds(CH, 'u1');
    expect(active).toEqual(['u2']);
  });

  it('getActiveTypistIds returns empty for unknown channel', () => {
    const active = useTyping.getState().getActiveTypistIds('nonexistent', 'u1');
    expect(active).toEqual([]);
  });

  // ── TTL expiry ──────────────────────────────────────────────────────

  it('active typists expire after 5s TTL (frozen clock advance)', () => {
    const clock = createFrozenClock(0);
    setClock(clock);

    useTyping.getState().recordTyping(CH, 'u1');
    expect(useTyping.getState().getActiveTypistIds(CH, 'u2')).toEqual(['u1']);

    // Advance 4s — still active
    clock.advance(4_000);
    expect(useTyping.getState().getActiveTypistIds(CH, 'u2')).toEqual(['u1']);

    // Advance to 5s — the cleanup timer fires
    clock.advance(1_000);
    expect(useTyping.getState().getActiveTypistIds(CH, 'u2')).toEqual([]);
  });

  it('re-recording extends the TTL (idempotent refresh)', () => {
    const clock = createFrozenClock(0);
    setClock(clock);

    useTyping.getState().recordTyping(CH, 'u1');

    // Advance 4s and re-record
    clock.advance(4_000);
    useTyping.getState().recordTyping(CH, 'u1');

    // Only 4s from original — but 0s from refresh, so still active
    expect(useTyping.getState().getActiveTypistIds(CH, 'u2')).toEqual(['u1']);

    // Advance another 4s (8s total, 4s from refresh)
    clock.advance(4_000);
    expect(useTyping.getState().getActiveTypistIds(CH, 'u2')).toEqual(['u1']);

    // Advance to 5s from refresh — expires
    clock.advance(1_000);
    expect(useTyping.getState().getActiveTypistIds(CH, 'u2')).toEqual([]);
  });

  // ── Outbound throttle ───────────────────────────────────────────────

  it('shouldSendTyping returns true when nothing has been sent yet', () => {
    expect(useTyping.getState().shouldSendTyping(CH)).toBe(true);
  });

  it('shouldSendTyping returns false within 3s of markSent, true after', () => {
    const clock = createFrozenClock(0);
    setClock(clock);

    useTyping.getState().markSent(CH);
    expect(useTyping.getState().shouldSendTyping(CH)).toBe(false);

    clock.advance(2_999);
    expect(useTyping.getState().shouldSendTyping(CH)).toBe(false);

    clock.advance(1);
    expect(useTyping.getState().shouldSendTyping(CH)).toBe(true);
  });

  it('markSent resets the throttle window', () => {
    const clock = createFrozenClock(0);
    setClock(clock);

    useTyping.getState().markSent(CH);
    clock.advance(3_000);
    expect(useTyping.getState().shouldSendTyping(CH)).toBe(true);

    useTyping.getState().markSent(CH);
    expect(useTyping.getState().shouldSendTyping(CH)).toBe(false);

    clock.advance(3_000);
    expect(useTyping.getState().shouldSendTyping(CH)).toBe(true);
  });
});
