import { describe, expect, it } from 'vitest';
import { formatMessageTimestamp } from './messageTimestamp';

describe('formatMessageTimestamp', () => {
  it('shows a time for messages from the current local day', () => {
    const now = new Date(2026, 7, 8, 18, 0);
    const posted = new Date(2026, 7, 8, 9, 5);

    expect(formatMessageTimestamp(posted, now, 'en-US')).toBe('9:05 AM');
  });

  it('shows a date once the message is from a different local day', () => {
    const now = new Date(2026, 7, 8, 0, 1);
    const posted = new Date(2026, 7, 7, 23, 59);

    expect(formatMessageTimestamp(posted, now, 'en-US')).toBe('Aug 7, 2026');
  });

  it('does not render Invalid Date for malformed timestamps', () => {
    expect(formatMessageTimestamp('not-a-date')).toBe('');
  });
});
