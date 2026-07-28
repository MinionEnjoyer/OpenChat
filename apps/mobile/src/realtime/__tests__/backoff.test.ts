import { BASE_DELAY_MS, MAX_DELAY_MS, backoffCapMs, backoffDelayMs } from '../backoff';

// @satisfies NFR-07
describe('reconnect backoff schedule', () => {
  it('matches the 1s→32s exponential table', () => {
    // The schedule the requirement names, as a literal table.
    expect(
      [0, 1, 2, 3, 4, 5, 6, 7, 20].map((attempt) => backoffCapMs(attempt)),
    ).toEqual([1000, 2000, 4000, 8000, 16000, 32000, 32000, 32000, 32000]);
  });

  it('caps at 32s forever', () => {
    expect(backoffCapMs(1000)).toBe(MAX_DELAY_MS);
  });

  it('applies full jitter within [0, cap]', () => {
    expect(backoffDelayMs(3, () => 0)).toBe(0);
    expect(backoffDelayMs(3, () => 0.999999)).toBeLessThan(backoffCapMs(3));
    expect(backoffDelayMs(0, () => 0.5)).toBe(BASE_DELAY_MS / 2);
  });
});
