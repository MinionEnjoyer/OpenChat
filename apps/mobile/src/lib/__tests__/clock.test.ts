import { clock, createFrozenClock, resetClock, setClock } from '../clock';

describe('clock', () => {
  afterEach(() => resetClock());

  it('reports the frozen instant and does not drift', () => {
    const frozen = createFrozenClock(1_700_000_000_000);
    setClock(frozen);
    const first = clock.now();
    // Busy-wait long enough that a real clock would move.
    const spinUntil = Date.now() + 5;
    while (Date.now() < spinUntil) {
      /* spin */
    }
    expect(clock.now()).toBe(first);
    expect(first).toBe(1_700_000_000_000);
  });

  it('fires timers only when time is advanced past their due point', () => {
    const frozen = createFrozenClock(0);
    setClock(frozen);
    const fired: string[] = [];
    clock.setTimeout(() => fired.push('at-100'), 100);

    frozen.advance(99);
    expect(fired).toEqual([]);
    frozen.advance(1);
    expect(fired).toEqual(['at-100']);
  });

  it('fires timers in due order regardless of scheduling order', () => {
    const frozen = createFrozenClock(0);
    setClock(frozen);
    const fired: string[] = [];
    clock.setTimeout(() => fired.push('late'), 300);
    clock.setTimeout(() => fired.push('early'), 100);
    clock.setTimeout(() => fired.push('middle'), 200);

    frozen.advance(500);
    expect(fired).toEqual(['early', 'middle', 'late']);
  });

  it('sets now() to each timer due time as it fires, not the advance target', () => {
    const frozen = createFrozenClock(0);
    setClock(frozen);
    const seen: number[] = [];
    clock.setTimeout(() => seen.push(clock.now()), 100);
    clock.setTimeout(() => seen.push(clock.now()), 250);

    frozen.advance(1000);
    expect(seen).toEqual([100, 250]);
    expect(clock.now()).toBe(1000);
  });

  it('does not fire a cleared timer', () => {
    const frozen = createFrozenClock(0);
    setClock(frozen);
    const fired: string[] = [];
    const handle = clock.setTimeout(() => fired.push('nope'), 50);
    clock.clearTimeout(handle);

    frozen.advance(100);
    expect(fired).toEqual([]);
  });

  it('resetClock restores the system clock', () => {
    setClock(createFrozenClock(42));
    expect(clock.now()).toBe(42);
    resetClock();
    expect(clock.now()).toBeGreaterThan(1_600_000_000_000);
  });
});
