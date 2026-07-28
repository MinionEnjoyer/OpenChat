// @satisfies FR-MSG-006
import {
  optimisticToggle,
  hasUserReacted,
  filterEmojis,
  mergeMessageUpdate,
  BUILTIN_EMOJIS,
  isBuiltinEmoji,
} from '../reactions';
import type { ReactionGroup } from '../reactions';

// ── Helpers ──

const empty = (): ReactionGroup[] => [];
const react = (emoji: string, ...userIds: string[]): ReactionGroup => ({
  emoji,
  count: userIds.length,
  userIds,
});

// ── optimisticToggle ──

// @satisfies FR-MSG-006
describe('optimisticToggle (reaction toggle logic)', () => {
  it('adds a new reaction group when no group exists for that emoji', () => {
    const result = optimisticToggle(empty(), 'u1', '👍', 'add');
    expect(result).toEqual([{ emoji: '👍', count: 1, userIds: ['u1'] }]);
  });

  it('adds userId to an existing group (count aggregation)', () => {
    const before = [react('👍', 'u1')];
    const result = optimisticToggle(before, 'u2', '👍', 'add');
    expect(result).toEqual([{ emoji: '👍', count: 2, userIds: ['u1', 'u2'] }]);
  });

  it('is idempotent: adding a reaction the user already has is a no-op', () => {
    const before = [react('👍', 'u1')];
    const result = optimisticToggle(before, 'u1', '👍', 'add');
    expect(result).toBe(before); // same reference — true no-op
  });

  it('removes userId from a group, decrementing count', () => {
    const before = [react('👍', 'u1', 'u2')];
    const result = optimisticToggle(before, 'u1', '👍', 'remove');
    expect(result).toEqual([{ emoji: '👍', count: 1, userIds: ['u2'] }]);
  });

  it('removes the entire group when the last user is removed', () => {
    const before = [react('👍', 'u1')];
    const result = optimisticToggle(before, 'u1', '👍', 'remove');
    expect(result).toEqual([]);
  });

  it('is idempotent: removing a reaction the user does not have is a no-op', () => {
    const before = [react('👍', 'u2')];
    const result = optimisticToggle(before, 'u1', '👍', 'remove');
    expect(result).toBe(before);
  });

  it('removing from a non-existent emoji group is a no-op', () => {
    const before = [react('❤️', 'u1')];
    const result = optimisticToggle(before, 'u1', '👍', 'remove');
    expect(result).toBe(before);
  });

  it('does not mutate the input array', () => {
    const before = [react('👍', 'u1')];
    const frozen = [...before];
    optimisticToggle(before, 'u2', '👍', 'add');
    expect(before).toEqual(frozen);
  });

  it('handles multiple emoji groups independently', () => {
    const before = [react('👍', 'u1'), react('❤️', 'u2')];
    const result = optimisticToggle(before, 'u1', '❤️', 'add');
    expect(result).toEqual([
      { emoji: '👍', count: 1, userIds: ['u1'] },
      { emoji: '❤️', count: 2, userIds: ['u2', 'u1'] },
    ]);
  });
});

// ── hasUserReacted ──

// @satisfies FR-MSG-006
describe('hasUserReacted (own-reaction highlighting)', () => {
  it('returns true when the user is in the userIds array', () => {
    expect(hasUserReacted([react('👍', 'u1', 'u2')], 'u1', '👍')).toBe(true);
  });

  it('returns false when the user is not in the userIds array', () => {
    expect(hasUserReacted([react('👍', 'u2')], 'u1', '👍')).toBe(false);
  });

  it('returns false when the emoji group does not exist', () => {
    expect(hasUserReacted([react('❤️', 'u1')], 'u1', '👍')).toBe(false);
  });

  it('returns false for an empty reactions array', () => {
    expect(hasUserReacted([], 'u1', '👍')).toBe(false);
  });
});

// ── filterEmojis ──

// @satisfies FR-MSG-006
describe('filterEmojis (picker search filtering)', () => {
  it('returns the full set when query is empty', () => {
    expect(filterEmojis('')).toEqual(BUILTIN_EMOJIS);
  });

  it('returns the full set when query is whitespace only', () => {
    expect(filterEmojis('   ')).toEqual(BUILTIN_EMOJIS);
  });

  it('matches by label substring (case-insensitive)', () => {
    const results = filterEmojis('heart');
    expect(results.map((e) => e.emoji)).toContain('❤️');
  });

  it('matches by keyword', () => {
    const results = filterEmojis('lol');
    expect(results.map((e) => e.emoji)).toContain('😂');
    expect(results.map((e) => e.emoji)).toContain('😂');
  });

  it('returns empty array when nothing matches', () => {
    expect(filterEmojis('zzz_nonexistent_zzz')).toEqual([]);
  });

  it('is case-insensitive for keywords', () => {
    const results = filterEmojis('LOL');
    expect(results.map((e) => e.emoji)).toContain('😂');
  });
});

// ── mergeMessageUpdate ──

// @satisfies FR-MSG-006
describe('mergeMessageUpdate (server ack merge)', () => {
  it('replaces reactions with the incoming set', () => {
    const cached = { id: 'm1', reactions: [react('👍', 'u1')], editedAt: null };
    const incoming = { id: 'm1', reactions: [react('👍', 'u1', 'u2'), react('❤️', 'u2')], editedAt: null };
    const merged = mergeMessageUpdate(cached, incoming);
    expect(merged.reactions).toEqual(incoming.reactions);
  });

  it('clears reactions when incoming has none', () => {
    const cached = { id: 'm1', reactions: [react('👍', 'u1')], editedAt: null };
    const incoming = { id: 'm1', reactions: [], editedAt: null };
    const merged = mergeMessageUpdate(cached, incoming);
    expect(merged.reactions).toEqual([]);
  });

  it('preserves other incoming fields like editedAt', () => {
    const cached: { id: string; reactions: ReactionGroup[]; editedAt: string | null } = { id: 'm1', reactions: [react('👍', 'u1')], editedAt: null };
    const incoming: { id: string; reactions: ReactionGroup[]; editedAt: string | null } = { id: 'm1', reactions: [react('👍', 'u1')], editedAt: '2026-07-25T12:00:00Z' };
    const merged = mergeMessageUpdate(cached, incoming);
    expect(merged.editedAt).toBe('2026-07-25T12:00:00Z');
  });
});

// ── isBuiltinEmoji ──

describe('isBuiltinEmoji', () => {
  it('recognizes a known emoji', () => {
    expect(isBuiltinEmoji('👍')).toBe(true);
  });

  it('rejects an unknown emoji', () => {
    expect(isBuiltinEmoji('🦄')).toBe(false);
  });
});
