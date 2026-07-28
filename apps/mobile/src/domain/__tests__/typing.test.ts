// @satisfies FR-MSG-009
import { formatTyping, type TypingFragments } from '../typing';

const f: TypingFragments = {
  one: 'is typing\u2026',
  twoConjunction: 'and',
  two: 'are typing\u2026',
  many: 'Several people are typing\u2026',
};

describe('formatTyping (typing indicator aggregation)', () => {
  it('empty list returns empty string', () => {
    expect(formatTyping([], f)).toBe('');
  });

  it('one user → "X is typing\u2026"', () => {
    expect(formatTyping(['Alice'], f)).toBe('Alice is typing\u2026');
  });

  it('two users → "X and Y are typing\u2026"', () => {
    expect(formatTyping(['Alice', 'Bob'], f)).toBe('Alice and Bob are typing\u2026');
  });

  it('three users → "Several people are typing\u2026"', () => {
    expect(formatTyping(['Alice', 'Bob', 'Carol'], f)).toBe('Several people are typing\u2026');
  });

  it('four users → "Several people are typing\u2026"', () => {
    expect(formatTyping(['A', 'B', 'C', 'D'], f)).toBe('Several people are typing\u2026');
  });
});
