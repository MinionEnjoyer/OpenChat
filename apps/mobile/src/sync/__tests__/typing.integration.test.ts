// @satisfies FR-MSG-009
/**
 * Integration test: typing indicator pipeline (FR-MSG-009).
 *
 * Exercises the real seam: applyEvent (sync layer) → useTyping store →
 * formatTyping aggregation. This crosses three components:
 *   1. gateway-event dispatch (applyEvent receives typing frames)
 *   2. typing store (recordTyping + getActiveTypistIds)
 *   3. domain aggregation (formatTyping)
 *
 * Acceptance criterion from specs/01-REQUIREMENTS.md:
 *   "Integration: two senders → 'A and B are typing…'"
 */
import { applyEvent } from '../queryClient';
import { useTyping } from '../../stores/typing';
import { formatTyping } from '../../domain/typing';
import type { TypingFrame } from '../../realtime/events.d';

const CH = 'channel-1';

describe('FR-MSG-009 integration — typing pipeline', () => {
  beforeEach(() => {
    useTyping.setState({ typists: {}, lastSent: {}, activeTimers: {} });
  });

  it('single typist: applyEvent → store → formatTyping', () => {
    const frame: TypingFrame = {
      op: 'typing',
      d: { channelId: CH, userId: 'u1' },
    };
    applyEvent(frame);

    const active = useTyping.getState().getActiveTypistIds(CH, 'u-self');
    expect(active).toEqual(['u1']);

    const text = formatTyping(['User1'], {
      one: 'is typing…',
      twoConjunction: 'and',
      two: 'are typing…',
      many: 'Several people are typing…',
    });
    expect(text).toBe('User1 is typing…');
  });

  it('two typists: applyEvent twice → "A and B are typing…"', () => {
    applyEvent({ op: 'typing', d: { channelId: CH, userId: 'alice' } });
    applyEvent({ op: 'typing', d: { channelId: CH, userId: 'bob' } });

    const active = useTyping.getState().getActiveTypistIds(CH, 'u-self');
    expect(active).toHaveLength(2);
    expect(active).toContain('alice');
    expect(active).toContain('bob');

    const text = formatTyping(['Alice', 'Bob'], {
      one: 'is typing…',
      twoConjunction: 'and',
      two: 'are typing…',
      many: 'Several people are typing…',
    });
    expect(text).toBe('Alice and Bob are typing…');
  });

  it('three typists: applyEvent ×3 → "Several people are typing…"', () => {
    applyEvent({ op: 'typing', d: { channelId: CH, userId: 'alice' } });
    applyEvent({ op: 'typing', d: { channelId: CH, userId: 'bob' } });
    applyEvent({ op: 'typing', d: { channelId: CH, userId: 'carol' } });

    const active = useTyping.getState().getActiveTypistIds(CH, 'u-self');
    expect(active).toHaveLength(3);

    const text = formatTyping(['Alice', 'Bob', 'Carol'], {
      one: 'is typing…',
      twoConjunction: 'and',
      two: 'are typing…',
      many: 'Several people are typing…',
    });
    expect(text).toBe('Several people are typing…');
  });

  it('own typing excluded from active typists', () => {
    applyEvent({ op: 'typing', d: { channelId: CH, userId: 'u-self' } });
    applyEvent({ op: 'typing', d: { channelId: CH, userId: 'alice' } });

    const active = useTyping.getState().getActiveTypistIds(CH, 'u-self');
    expect(active).toEqual(['alice']);
  });

  it('empty channel returns empty active list', () => {
    const active = useTyping.getState().getActiveTypistIds('nonexistent', 'u-self');
    expect(active).toEqual([]);

    const text = formatTyping([], {
      one: 'is typing…',
      twoConjunction: 'and',
      two: 'are typing…',
      many: 'Several people are typing…',
    });
    expect(text).toBe('');
  });
});
