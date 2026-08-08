import { beforeEach, describe, expect, it } from 'vitest';
import type { Channel, Message } from './types';
import { useAppStore } from './appStore';

function message(id: string, overrides: Partial<Message> = {}): Message {
  return {
    id,
    channelId: 'general',
    authorId: 'user-1',
    content: id,
    createdAt: '2026-08-08T12:00:00Z',
    editedAt: null,
    deletedAt: null,
    replyToId: null,
    pinned: false,
    kind: 'USER',
    author: { id: 'user-1', username: 'user', displayName: null, avatarUrl: null, status: 'ONLINE', isBot: false },
    attachments: [],
    reactions: [],
    replyTo: null,
    ...overrides,
  };
}

function channel(id: string): Channel {
  return {
    id,
    serverId: 'server-1',
    categoryId: null,
    name: id,
    type: 'TEXT',
    topic: null,
    position: 0,
    parentId: null,
    isDefault: id === 'general',
  };
}

beforeEach(() => {
  useAppStore.setState({
    channelsByServer: {},
    serverIdByChannel: {},
    messagesByChannel: {},
    unreadByChannel: {},
    presenceById: {},
  });
});

describe('application state store', () => {
  it('deduplicates paginated messages while preserving their direction', () => {
    const store = useAppStore.getState();
    store.setMessages('general', [message('middle')]);
    store.prependMessages('general', [message('old'), message('middle')]);
    store.appendMessages('general', [message('middle'), message('new')]);

    expect(useAppStore.getState().messagesByChannel.general?.map(({ id }) => id))
      .toEqual(['old', 'middle', 'new']);
  });

  it('replaces optimistic messages and marks timed-out sends as failed', () => {
    const pending = message('temp', { nonce: 'nonce-1', pending: true });
    const real = message('saved');
    useAppStore.getState().setMessages('general', [pending]);
    useAppStore.getState().replacePending('general', 'nonce-1', real);
    expect(useAppStore.getState().messagesByChannel.general).toEqual([real]);

    const timeout = message('timeout', { pending: true });
    useAppStore.getState().addMessage(timeout);
    useAppStore.getState().markFailed('general', 'timeout');
    expect(useAppStore.getState().messagesByChannel.general?.slice(-1)[0])
      .toMatchObject({ id: 'timeout', pending: false, failed: true });
  });

  it('updates the channel index and unread counters atomically', () => {
    useAppStore.getState().setChannels('server-1', [channel('general')]);
    useAppStore.getState().bumpUnread('general');
    useAppStore.getState().bumpUnread('general');

    expect(useAppStore.getState().serverIdByChannel.general).toBe('server-1');
    expect(useAppStore.getState().unreadByChannel.general).toBe(2);
    useAppStore.getState().clearUnread('general');
    expect(useAppStore.getState().unreadByChannel).not.toHaveProperty('general');
  });
});
