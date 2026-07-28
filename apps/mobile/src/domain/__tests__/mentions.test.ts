// @satisfies FR-MSG-008 — Mentions: parser/serialize round-trip,
// @everyone/@here detection, permission gate, autocomplete filtering,
// canonical syntax match with web + server.

import { describe, expect, it } from '@jest/globals';
import {
  buildMentionCandidates,
  detectMentionTrigger,
  filterMentionCandidates,
  insertMention,
  parseMentionSegments,
  canMentionEveryone,
  buildMemberUsernameSet,
  type MentionCandidate,
  type MemberBrief,
} from '../mentions';

// ── Test helpers ──

function member(id: string, username: string, displayName?: string): MemberBrief {
  return {
    userId: id,
    user: { username, displayName: displayName ?? null, avatarUrl: null },
  };
}

function members(...ms: MemberBrief[]): MemberBrief[] {
  return ms;
}

// ── Canonical syntax (derived from web + server) ──

describe('canonical mention syntax (FR-MSG-008)', () => {
  it('emits @username with trailing space (matching apps/web/src/App.tsx:1456)', () => {
    const result = insertMention('Hello @al', 6, 'al', 'alice');
    // Web emits: before + "@username " + after
    expect(result).toBe('Hello @alice ');
  });

  it('preserves text before and after the replaced trigger', () => {
    const result = insertMention('Hey @bob how are you?', 4, 'bob', 'bobmarley');
    expect(result).toBe('Hey @bobmarley  how are you?');
  });

  it('inserts at start of text', () => {
    const result = insertMention('@ch', 0, 'ch', 'charlie');
    expect(result).toBe('@charlie ');
  });

  it('server dispatchMentions regex matches the emitted syntax', () => {
    // Server line 347: /(?:^|\s)@([\w.-]+)/g
    const serverRe = /(?:^|\s)@([\w.-]+)/g;
    const text = 'Hello @alice and @bob-marley!';

    const matches = [...text.matchAll(serverRe)].map((m) => m[1]!.toLowerCase());
    expect(matches).toContain('alice');
    expect(matches).toContain('bob-marley');
  });

  it('server @everyone regex matches', () => {
    // Server line 345: /(^|\s)@everyone\b/
    const re = /(^|\s)@everyone\b/;
    expect(re.test('@everyone')).toBe(true);
    expect(re.test('Hello @everyone')).toBe(true);
    expect(re.test('@everyone!')).toBe(true);
    expect(re.test('@everyone123')).toBe(false);
  });

  it('server @here regex matches', () => {
    // Server line 346: /(^|\s)@here\b/
    const re = /(^|\s)@here\b/;
    expect(re.test('@here')).toBe(true);
    expect(re.test('Hello @here')).toBe(true);
    expect(re.test('@here!')).toBe(true);
    expect(re.test('@heretic')).toBe(false);
  });
});

// ── parseMentionSegments ──

describe('parseMentionSegments', () => {
  const nameSet = new Set(['alice', 'bob', 'bob-marley']);

  it('returns plain text for content without mentions', () => {
    const result = parseMentionSegments('Hello world', nameSet, undefined);
    expect(result).toEqual([{ kind: 'plain', text: 'Hello world' }]);
  });

  it('detects @user mentions for valid members', () => {
    const result = parseMentionSegments('@alice hello', nameSet, undefined);
    expect(result).toEqual([
      { kind: 'mention', value: 'alice', display: '@alice', isSelf: false },
      { kind: 'plain', text: ' hello' },
    ]);
  });

  it('does not highlight @mentions for non-members', () => {
    const result = parseMentionSegments('@charlie said hi', nameSet, undefined);
    expect(result).toEqual([{ kind: 'plain', text: '@charlie said hi' }]);
  });

  it('detects @everyone mention', () => {
    const result = parseMentionSegments('Hey @everyone!', nameSet, undefined);
    expect(result).toEqual([
      { kind: 'plain', text: 'Hey ' },
      { kind: 'mention', value: 'everyone', display: '@everyone', isSelf: true },
      { kind: 'plain', text: '!' },
    ]);
  });

  it('detects @here mention', () => {
    const result = parseMentionSegments('@here listen up', nameSet, undefined);
    expect(result).toEqual([
      { kind: 'mention', value: 'here', display: '@here', isSelf: true },
      { kind: 'plain', text: ' listen up' },
    ]);
  });

  it('marks own mentions with isSelf=true', () => {
    const result = parseMentionSegments('@alice @bob', nameSet, 'alice');
    expect(result[0]).toMatchObject({ kind: 'mention', value: 'alice', isSelf: true });
    expect(result[2]).toMatchObject({ kind: 'mention', value: 'bob', isSelf: false });
  });

  it('handles multiple mentions in one message', () => {
    const result = parseMentionSegments(
      '@alice and @bob met @everyone',
      nameSet,
      undefined,
    );
    expect(result).toHaveLength(5);
    expect(result.filter((s) => s.kind === 'mention')).toHaveLength(3);
  });

  it('handles empty string', () => {
    expect(parseMentionSegments('', nameSet, undefined)).toEqual([]);
  });

  it('handles username with dots and hyphens', () => {
    const extendedSet = new Set(['alice', 'bob', 'bob-marley', 'dr.smith']);
    const result = parseMentionSegments('@bob-marley and @dr.smith', extendedSet, undefined);
    expect(result[0]).toMatchObject({ kind: 'mention', value: 'bob-marley' });
    expect(result[2]).toMatchObject({ kind: 'mention', value: 'dr.smith' });
  });

  it('case-insensitive match on member usernames', () => {
    const result = parseMentionSegments('@ALICE @Bob', nameSet, undefined);
    expect(result[0]).toMatchObject({ kind: 'mention', value: 'alice', display: '@ALICE' });
    expect(result[2]).toMatchObject({ kind: 'mention', value: 'bob', display: '@Bob' });
  });

  it('does not highlight @everyone123 as @everyone (word boundary)', () => {
    const result = parseMentionSegments('@everyone123', nameSet, undefined);
    expect(result[0]?.kind).toBe('plain');
  });
});

// ── canMentionEveryone ──

describe('canMentionEveryone', () => {
  it('returns true for owner regardless of permissions', () => {
    expect(canMentionEveryone('0', true)).toBe(true);
    expect(canMentionEveryone(undefined, true)).toBe(true);
  });

  it('returns true when MENTION_EVERYONE bit is set', () => {
    // MENTION_EVERYONE = 1n << 7n = 128
    expect(canMentionEveryone('128', false)).toBe(true);
    expect(canMentionEveryone('192', false)).toBe(true); // 128 + 64 = MANAGE_MESSAGES
  });

  it('returns false when MENTION_EVERYONE bit is not set', () => {
    expect(canMentionEveryone('0', false)).toBe(false);
    expect(canMentionEveryone('64', false)).toBe(false); // only MANAGE_MESSAGES
  });

  it('returns false for undefined permissions (non-owner)', () => {
    expect(canMentionEveryone(undefined, false)).toBe(false);
  });

  it('handles invalid permission string gracefully', () => {
    expect(canMentionEveryone('not-a-number', false)).toBe(false);
  });
});

// ── buildMentionCandidates ──

describe('buildMentionCandidates', () => {
  it('includes user members', () => {
    const ms = members(member('1', 'alice'), member('2', 'bob'));
    const candidates = buildMentionCandidates(ms, false);
    expect(candidates).toHaveLength(2);
    expect(candidates[0]!.username).toBe('alice');
    expect(candidates[1]!.username).toBe('bob');
  });

  it('includes @everyone and @here when canEveryone is true', () => {
    const ms = members(member('1', 'alice'));
    const candidates = buildMentionCandidates(ms, true);
    expect(candidates).toHaveLength(3);
    expect(candidates[0]!.id).toBe('__everyone__');
    expect(candidates[1]!.id).toBe('__here__');
    expect(candidates[2]!.username).toBe('alice');
  });

  it('excludes @everyone and @here when canEveryone is false', () => {
    const ms = members(member('1', 'alice'));
    const candidates = buildMentionCandidates(ms, false);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.username).toBe('alice');
  });

  it('handles undefined members', () => {
    const candidates = buildMentionCandidates(undefined, true);
    expect(candidates).toHaveLength(2); // everyone + here only
  });

  // DEFECT 2 (fix-mentions-kav): when members not loaded (empty or undefined),
  // only @everyone + @here appear. No real usernames in candidates → mention
  // picker can't show user mentions. Fix: ChatPane triggers members fetch
  // when the user types @, populating candidates before the picker renders.
  it('returns only @everyone/@here when members is empty (no real users)', () => {
    const candidates = buildMentionCandidates([], true);
    expect(candidates).toHaveLength(2);
    expect(candidates[0]!.id).toBe('__everyone__');
    expect(candidates[1]!.id).toBe('__here__');
  });

  it('filters out members with null user', () => {
    const ms: MemberBrief[] = [
      member('1', 'alice'),
      { userId: '2', user: null },
    ];
    const candidates = buildMentionCandidates(ms, false);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.username).toBe('alice');
  });
});

// ── detectMentionTrigger ──

describe('detectMentionTrigger', () => {
  it('returns null when no candidates exist', () => {
    expect(detectMentionTrigger('Hello @al', 9, false)).toBeNull();
  });

  // DEFECT 2 (fix-mentions-kav): when members aren't loaded, `hasCandidates` is false
  // and @-mention detection is completely gated. Typing @bob returns null, so the
  // mention picker never renders and real users can't be mentioned.
  // Fix: ChatPane now triggers members fetch via onMentionTrigger when draft contains @.
  it('returns null for @bob when hasCandidates is false (members not loaded)', () => {
    expect(detectMentionTrigger('@bob', 4, false)).toBeNull();
  });

  it('detects @ at cursor position', () => {
    const result = detectMentionTrigger('Hello @al', 9, true);
    expect(result).toEqual({ query: 'al', start: 6 });
  });

  it('detects @ at start of text', () => {
    const result = detectMentionTrigger('@al', 3, true);
    expect(result).toEqual({ query: 'al', start: 0 });
  });

  it('detects @ after space', () => {
    const result = detectMentionTrigger('Hi @bob', 7, true);
    expect(result).toEqual({ query: 'bob', start: 3 });
  });

  it('returns null when cursor is before the @', () => {
    expect(detectMentionTrigger('Hello @al', 5, true)).toBeNull();
  });

  it('returns null for mid-word @ (e.g. email)', () => {
    expect(detectMentionTrigger('alice@example.com', 16, true)).toBeNull();
  });

  it('returns empty query for bare @', () => {
    const result = detectMentionTrigger('Hello @', 7, true);
    expect(result).toEqual({ query: '', start: 6 });
  });
});

// ── filterMentionCandidates ──

describe('filterMentionCandidates', () => {
  const candidates: MentionCandidate[] = [
    { id: '__everyone__', username: 'everyone', displayName: '@everyone', avatarUrl: null },
    { id: '__here__', username: 'here', displayName: '@here', avatarUrl: null },
    { id: '1', username: 'alice', displayName: 'Alice', avatarUrl: null },
    { id: '2', username: 'bob', displayName: 'Bob', avatarUrl: null },
    { id: '3', username: 'bob-marley', displayName: 'Bob Marley', avatarUrl: null },
  ];

  it('filters by username substring (case-insensitive)', () => {
    const result = filterMentionCandidates(candidates, 'al');
    expect(result).toHaveLength(1);
    expect(result[0]!.username).toBe('alice');
  });

  it('filters @everyone by prefix', () => {
    const result = filterMentionCandidates(candidates, 'ev');
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('__everyone__');
  });

  it('filters @here by prefix', () => {
    const result = filterMentionCandidates(candidates, 'he');
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('__here__');
  });

  it('returns multiple matches', () => {
    const result = filterMentionCandidates(candidates, 'bob');
    expect(result).toHaveLength(2); // bob, bob-marley
  });

  it('returns empty for no match', () => {
    const result = filterMentionCandidates(candidates, 'zzz');
    expect(result).toHaveLength(0);
  });

  it('returns all for empty query', () => {
    const result = filterMentionCandidates(candidates, '');
    expect(result).toHaveLength(5);
  });

  it('case-insensitive matching', () => {
    const result = filterMentionCandidates(candidates, 'AL');
    expect(result).toHaveLength(1);
    expect(result[0]!.username).toBe('alice');
  });
});

// ── insertMention round-trip ──

describe('insertMention round-trip', () => {
  it('parse can read back what insertMention created', () => {
    // Simulate: user types "Hello @" then selects "alice"
    const trigger = detectMentionTrigger('Hello @', 7, true);
    expect(trigger).not.toBeNull();

    const inserted = insertMention('Hello @', trigger!.start, trigger!.query, 'alice');
    expect(inserted).toBe('Hello @alice ');

    // Now parse the result — the mention should be detected
    const nameSet = new Set(['alice']);
    const segments = parseMentionSegments(inserted, nameSet, undefined);
    const mentions = segments.filter((s) => s.kind === 'mention');
    expect(mentions).toHaveLength(1);
    expect(mentions[0]).toMatchObject({ value: 'alice', display: '@alice' });
  });

  it('parse can read back what insertMention created for @everyone', () => {
    const trigger = detectMentionTrigger('@ev', 3, true);
    expect(trigger).not.toBeNull();

    const inserted = insertMention('@ev', trigger!.start, trigger!.query, 'everyone');
    expect(inserted).toBe('@everyone ');

    const nameSet = new Set<string>();
    const segments = parseMentionSegments(inserted, nameSet, undefined);
    const mentions = segments.filter((s) => s.kind === 'mention');
    expect(mentions).toHaveLength(1);
    expect(mentions[0]).toMatchObject({ value: 'everyone', display: '@everyone' });
  });
});

// ── buildMemberUsernameSet ──

describe('buildMemberUsernameSet', () => {
  it('extracts lowercase usernames from members', () => {
    const ms = members(member('1', 'Alice'), member('2', 'BOB'));
    const set = buildMemberUsernameSet(ms);
    expect(set.has('alice')).toBe(true);
    expect(set.has('bob')).toBe(true);
    expect(set.has('charlie')).toBe(false);
  });

  it('handles undefined members', () => {
    const set = buildMemberUsernameSet(undefined);
    expect(set.size).toBe(0);
  });

  it('filters out null-user members', () => {
    const ms: MemberBrief[] = [
      member('1', 'alice'),
      { userId: '2', user: null },
    ];
    const set = buildMemberUsernameSet(ms);
    expect(set.size).toBe(1);
    expect(set.has('alice')).toBe(true);
  });
});
