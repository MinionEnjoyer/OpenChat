/**
 * Clock — the single source of "now" for the app (06 §5, 04 §6).
 *
 * Every `Date.now()` and every timer goes through here so E2E runs can freeze
 * time and get deterministic output. Reading the wall clock directly anywhere
 * else is a lint error.
 */

export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): TimeoutHandle;
  clearTimeout(handle: TimeoutHandle): void;
}

export type TimeoutHandle = ReturnType<typeof globalThis.setTimeout>;

const systemClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle),
};

/**
 * A clock frozen at a fixed instant. Time only moves when the test advances it,
 * so a test never depends on how long the machine took to run it.
 */
export function createFrozenClock(startMs: number): Clock & { advance(ms: number): void } {
  let current = startMs;
  // Pending timers, kept sorted by due time so advance() fires them in order.
  const pending: { id: number; due: number; fn: () => void }[] = [];
  let nextId = 1;

  return {
    now: () => current,
    setTimeout(fn, ms) {
      const id = nextId++;
      pending.push({ id, due: current + ms, fn });
      pending.sort((a, b) => a.due - b.due);
      return id as unknown as TimeoutHandle;
    },
    clearTimeout(handle) {
      const idx = pending.findIndex((t) => t.id === (handle as unknown as number));
      if (idx >= 0) pending.splice(idx, 1);
    },
    advance(ms) {
      const target = current + ms;
      // Fire due timers in order. A timer scheduled by a firing timer is picked
      // up on the next loop pass if it is also due within this advance.
      for (;;) {
        const next = pending[0];
        if (!next || next.due > target) break;
        pending.shift();
        current = next.due;
        next.fn();
      }
      current = target;
    },
  };
}

let active: Clock = systemClock;

export function setClock(clock: Clock): void {
  active = clock;
}

export function resetClock(): void {
  active = systemClock;
}

export const clock: Clock = {
  now: () => active.now(),
  setTimeout: (fn, ms) => active.setTimeout(fn, ms),
  clearTimeout: (handle) => active.clearTimeout(handle),
};
