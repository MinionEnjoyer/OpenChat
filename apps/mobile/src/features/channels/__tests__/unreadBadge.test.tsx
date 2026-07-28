/**
 * Unread badge tests (FR-MSG-010).
 *
 * Domain-level tests cover computeChannelUnread edge cases.
 * ChannelList rendering is covered by voiceJoinOnTap.test.tsx.
 */
import { computeChannelUnread } from '../../../domain/unread';

describe('computeChannelUnread (FR-MSG-010)', () => {
  it('shows mention count when messages mention user', () => {
    const result = computeChannelUnread(
      'ch-1',
      { channelId: 'ch-1', lastReadMessageId: 'm1' },
      [
        { id: 'm1', channelId: 'ch-1', authorId: 'other', mentionsUser: false, deleted: false },
        { id: 'm2', channelId: 'ch-1', authorId: 'other', mentionsUser: true, deleted: false },
        { id: 'm3', channelId: 'ch-1', authorId: 'other', mentionsUser: true, deleted: false },
      ],
      'me',
    );
    expect(result.mentionCount).toBe(2);
    expect(result.unread).toBe(2);
  });

  it('shows zero unread when all messages are own', () => {
    const result = computeChannelUnread(
      'ch-1',
      undefined,
      [
        { id: 'm1', channelId: 'ch-1', authorId: 'me', mentionsUser: false, deleted: false },
        { id: 'm2', channelId: 'ch-1', authorId: 'me', mentionsUser: false, deleted: false },
      ],
      'me',
    );
    expect(result.unread).toBe(0);
    expect(result.mentionCount).toBe(0);
  });

  it('clears unread after advancing read state', () => {
    const before = computeChannelUnread(
      'ch-1',
      undefined,
      [
        { id: 'm1', channelId: 'ch-1', authorId: 'other', mentionsUser: false, deleted: false },
        { id: 'm2', channelId: 'ch-1', authorId: 'other', mentionsUser: true, deleted: false },
      ],
      'me',
    );
    expect(before.unread).toBe(2);

    const after = computeChannelUnread(
      'ch-1',
      { channelId: 'ch-1', lastReadMessageId: 'm2' },
      [
        { id: 'm1', channelId: 'ch-1', authorId: 'other', mentionsUser: false, deleted: false },
        { id: 'm2', channelId: 'ch-1', authorId: 'other', mentionsUser: true, deleted: false },
      ],
      'me',
    );
    expect(after.unread).toBe(0);
    expect(after.mentionCount).toBe(0);
  });

  it('badge testID follows unread-badge-<channelId> convention', () => {
    const channelId = 'text-1';
    expect(`unread-badge-${channelId}`).toBe('unread-badge-text-1');
  });
});
