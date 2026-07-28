// @satisfies FR-MSG-012
import {
  validatePollOptions,
  computeTally,
  findUserVote,
  isPollClosed,
  voteAction,
  optimisticVote,
} from '../polls';
import type { Poll } from '../../api/schema';

// ── Helpers ──

function makePoll(overrides: Partial<Poll> = {}): Poll {
  return {
    id: 'poll-1',
    question: 'Best fruit?',
    multiple: false,
    closesAt: null,
    options: [
      { id: 'opt-1', text: 'Apple', voterIds: [] },
      { id: 'opt-2', text: 'Banana', voterIds: [] },
      { id: 'opt-3', text: 'Cherry', voterIds: [] },
    ],
    ...overrides,
  };
}

function makeOpts(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `Option ${i + 1}`);
}

// ── validatePollOptions ──

describe('validatePollOptions (option-count validation)', () => {
  it('rejects 1 option', () => {
    const r = validatePollOptions(makeOpts(1));
    expect(r.valid).toBe(false);
    expect(r.error).toBe('poll.optionsTooFew');
  });

  it('accepts 2 options (boundary)', () => {
    const r = validatePollOptions(makeOpts(2));
    expect(r.valid).toBe(true);
    expect(r.error).toBeUndefined();
  });

  it('accepts 10 options (boundary)', () => {
    const r = validatePollOptions(makeOpts(10));
    expect(r.valid).toBe(true);
    expect(r.error).toBeUndefined();
  });

  it('rejects 11 options', () => {
    const r = validatePollOptions(makeOpts(11));
    expect(r.valid).toBe(false);
    expect(r.error).toBe('poll.optionsTooMany');
  });
});

// ── computeTally ──

describe('computeTally (percentage math)', () => {
  it('returns zero pct for all options when no votes', () => {
    const poll = makePoll({
      options: [
        { id: 'a', text: 'A', voterIds: [] },
        { id: 'b', text: 'B', voterIds: [] },
      ],
    });
    const tally = computeTally(poll.options);
    expect(tally).toEqual([
      { optionId: 'a', text: 'A', count: 0, pct: 0 },
      { optionId: 'b', text: 'B', count: 0, pct: 0 },
    ]);
  });

  it('computes percentages for distributed votes', () => {
    const poll = makePoll({
      options: [
        { id: 'a', text: 'A', voterIds: ['u1', 'u2'] },
        { id: 'b', text: 'B', voterIds: ['u3'] },
      ],
    });
    const tally = computeTally(poll.options);
    expect(tally).toEqual([
      { optionId: 'a', text: 'A', count: 2, pct: 67 },
      { optionId: 'b', text: 'B', count: 1, pct: 33 },
    ]);
  });

  it('handles tie (equal vote counts)', () => {
    const poll = makePoll({
      options: [
        { id: 'a', text: 'A', voterIds: ['u1'] },
        { id: 'b', text: 'B', voterIds: ['u2'] },
      ],
    });
    const tally = computeTally(poll.options);
    expect(tally[0]!.pct).toBe(50);
    expect(tally[1]!.pct).toBe(50);
  });

  it('preserves option creation order', () => {
    const poll = makePoll({
      options: [
        { id: 'c', text: 'C', voterIds: ['u1'] },
        { id: 'a', text: 'A', voterIds: [] },
        { id: 'b', text: 'B', voterIds: [] },
      ],
    });
    const tally = computeTally(poll.options);
    expect(tally.map((t) => t.optionId)).toEqual(['c', 'a', 'b']);
  });
});

// ── findUserVote ──

describe('findUserVote (own-vote detection)', () => {
  it('returns the option the user voted for', () => {
    const poll = makePoll({
      options: [
        { id: 'a', text: 'A', voterIds: [] },
        { id: 'b', text: 'B', voterIds: ['u1'] },
      ],
    });
    expect(findUserVote(poll, 'u1')).toBe('b');
  });

  it('returns null when user has not voted', () => {
    const poll = makePoll();
    expect(findUserVote(poll, 'u1')).toBeNull();
  });

  it('returns first match for multi-choice poll', () => {
    const poll = makePoll({
      options: [
        { id: 'a', text: 'A', voterIds: ['u1'] },
        { id: 'b', text: 'B', voterIds: ['u1'] },
      ],
    });
    // Returns first option where userId found
    expect(findUserVote(poll, 'u1')).toBe('a');
  });
});

// ── isPollClosed ──

describe('isPollClosed', () => {
  it('returns false when closesAt is null', () => {
    const poll = makePoll({ closesAt: null });
    expect(isPollClosed(poll)).toBe(false);
  });

  it('returns true when closesAt is in the past', () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const poll = makePoll({ closesAt: past });
    expect(isPollClosed(poll)).toBe(true);
  });

  it('returns false when closesAt is in the future', () => {
    const future = new Date(Date.now() + 3600_000).toISOString();
    const poll = makePoll({ closesAt: future });
    expect(isPollClosed(poll)).toBe(false);
  });
});

// ── voteAction ──

describe('voteAction (vote-switching logic)', () => {
  describe('single-choice (multiple=false)', () => {
    it('toggles off when tapping own vote', () => {
      const poll = makePoll({
        options: [
          { id: 'a', text: 'A', voterIds: ['u1'] },
          { id: 'b', text: 'B', voterIds: [] },
        ],
      });
      const action = voteAction(poll, 'u1', 'a');
      expect(action).toEqual({ add: null, remove: 'a' });
    });

    it('switches vote when tapping different option', () => {
      const poll = makePoll({
        options: [
          { id: 'a', text: 'A', voterIds: ['u1'] },
          { id: 'b', text: 'B', voterIds: [] },
        ],
      });
      const action = voteAction(poll, 'u1', 'b');
      expect(action).toEqual({ add: 'b', remove: 'a' });
    });

    it('adds new vote when user has no prior vote', () => {
      const poll = makePoll();
      const action = voteAction(poll, 'u1', 'a');
      expect(action).toEqual({ add: 'a', remove: null });
    });
  });

  describe('multi-choice (multiple=true)', () => {
    it('toggles off when tapping own vote', () => {
      const poll = makePoll({
        multiple: true,
        options: [
          { id: 'a', text: 'A', voterIds: ['u1'] },
          { id: 'b', text: 'B', voterIds: [] },
        ],
      });
      const action = voteAction(poll, 'u1', 'a');
      expect(action).toEqual({ add: null, remove: 'a' });
    });

    it('adds vote while keeping existing votes', () => {
      const poll = makePoll({
        multiple: true,
        options: [
          { id: 'a', text: 'A', voterIds: ['u1'] },
          { id: 'b', text: 'B', voterIds: [] },
        ],
      });
      const action = voteAction(poll, 'u1', 'b');
      expect(action).toEqual({ add: 'b', remove: null });
    });
  });
});

// ── optimisticVote ──

describe('optimisticVote (immutable poll update)', () => {
  it('adds userId to the target option', () => {
    const poll = makePoll({
      options: [
        { id: 'a', text: 'A', voterIds: [] },
        { id: 'b', text: 'B', voterIds: [] },
      ],
    });
    const result = optimisticVote(poll, 'a', null, 'u1');
    expect(result.options[0]!.voterIds).toEqual(['u1']);
    expect(result.options[1]!.voterIds).toEqual([]);
    // Original must not be mutated
    expect(poll.options[0]!.voterIds).toEqual([]);
  });

  it('removes userId when voting off', () => {
    const poll = makePoll({
      options: [
        { id: 'a', text: 'A', voterIds: ['u1'] },
      ],
    });
    const result = optimisticVote(poll, null, 'a', 'u1');
    expect(result.options[0]!.voterIds).toEqual([]);
  });

  it('switches: removes from old and adds to new', () => {
    const poll = makePoll({
      options: [
        { id: 'a', text: 'A', voterIds: ['u1'] },
        { id: 'b', text: 'B', voterIds: [] },
      ],
    });
    const result = optimisticVote(poll, 'b', 'a', 'u1');
    expect(result.options[0]!.voterIds).toEqual([]);
    expect(result.options[1]!.voterIds).toEqual(['u1']);
  });

  it('does not duplicate user in target when already present', () => {
    const poll = makePoll({
      options: [
        { id: 'a', text: 'A', voterIds: ['u1'] },
      ],
    });
    const result = optimisticVote(poll, 'a', 'b', 'u1');
    expect(result.options[0]!.voterIds).toEqual(['u1']); // unchanged
  });

  it('handles add without remove (new vote)', () => {
    const poll = makePoll();
    const result = optimisticVote(poll, 'opt-1', null, 'u1');
    expect(result.options[0]!.voterIds).toEqual(['u1']);
  });
});
