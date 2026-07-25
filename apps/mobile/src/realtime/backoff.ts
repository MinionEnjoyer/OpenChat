/**
 * Reconnect backoff schedule (NFR-07): exponential 1s→32s with full jitter.
 * Pure so the schedule is unit-testable as a table.
 */
export const BASE_DELAY_MS = 1000;
export const MAX_DELAY_MS = 32000;

/** Upper bound of the delay window for a given attempt (0-based). */
export function backoffCapMs(attempt: number): number {
  return Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** attempt);
}

/**
 * Full jitter (AWS-style): uniform in [0, cap]. `random` injectable for
 * deterministic tests.
 */
export function backoffDelayMs(attempt: number, random: () => number = Math.random): number {
  return Math.floor(random() * backoffCapMs(attempt));
}
