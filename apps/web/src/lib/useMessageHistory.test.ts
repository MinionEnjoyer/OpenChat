import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from './api';
import { useAppStore } from './appStore';
import { saveChannelScrollPosition } from './channelScroll';
import type { Message } from './types';
import { useMessageHistory } from './useMessageHistory';

vi.mock('./api', () => ({
  getReadState: vi.fn(),
  listMessages: vi.fn(),
  markRead: vi.fn(),
}));

function message(id: string): Message {
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
    author: {
      id: 'user-1',
      username: 'user',
      displayName: null,
      avatarUrl: null,
      status: 'ONLINE',
      isBot: false,
    },
    attachments: [],
    reactions: [],
    replyTo: null,
  };
}

beforeEach(() => {
  useAppStore.setState({ activeChannelId: null, messagesByChannel: {} });
  vi.mocked(api.getReadState).mockReset();
  vi.mocked(api.listMessages).mockReset();
  vi.mocked(api.markRead).mockReset();
});

describe('useMessageHistory', () => {
  it('restores a saved viewport and stores the initial page chronologically', async () => {
    saveChannelScrollPosition('general', 'middle', 18);
    vi.mocked(api.getReadState).mockResolvedValue({
      lastReadMessageId: 'middle',
      latestMessageId: 'new',
    });
    vi.mocked(api.listMessages).mockResolvedValue([message('new'), message('middle'), message('old')]);
    useAppStore.getState().set({ activeChannelId: 'general' });
    const { result } = renderHook(() => useMessageHistory());

    let loaded = false;
    await act(async () => {
      result.current.beginChannelSelection('general');
      loaded = await result.current.loadInitialPage('general');
    });

    expect(loaded).toBe(true);
    expect(api.listMessages).toHaveBeenCalledWith('general', { around: 'middle' });
    expect(result.current.resumePositionByChannel.general).toMatchObject({ messageId: 'middle', offset: 18 });
    expect(result.current.resumePositionForChannel('general')).toMatchObject({ messageId: 'middle', offset: 18 });
    expect(result.current.hasMoreByChannel.general).toBe(false);
    expect(result.current.hasNewerByChannel.general).toBe(false);
    expect(useAppStore.getState().messagesByChannel.general.map(({ id }) => id))
      .toEqual(['old', 'middle', 'new']);
  });

  it('hides a previous visit anchor synchronously while a fresh page is loading', async () => {
    saveChannelScrollPosition('general', 'middle', 18);
    vi.mocked(api.getReadState).mockResolvedValue({ lastReadMessageId: 'middle', latestMessageId: 'new' });
    vi.mocked(api.listMessages).mockResolvedValue([message('new'), message('middle')]);
    useAppStore.getState().set({ activeChannelId: 'general' });
    const { result } = renderHook(() => useMessageHistory());

    await act(async () => {
      await result.current.loadInitialPage('general');
    });
    expect(result.current.resumePositionForChannel('general')?.messageId).toBe('middle');

    act(() => result.current.beginChannelSelection('general'));
    expect(result.current.resumePositionForChannel('general')).toBeUndefined();
  });

  it('falls back from a stale local anchor to the shared read marker', async () => {
    saveChannelScrollPosition('general', 'deleted', 30);
    vi.mocked(api.getReadState).mockResolvedValue({
      lastReadMessageId: 'server-read',
      latestMessageId: 'latest',
    });
    vi.mocked(api.listMessages)
      .mockRejectedValueOnce(new Error('anchor missing'))
      .mockResolvedValueOnce([message('server-read')]);
    useAppStore.getState().set({ activeChannelId: 'general' });
    const { result } = renderHook(() => useMessageHistory());

    await act(async () => {
      await result.current.loadInitialPage('general');
    });

    expect(api.listMessages).toHaveBeenNthCalledWith(1, 'general', { around: 'deleted' });
    expect(api.listMessages).toHaveBeenNthCalledWith(2, 'general', { around: 'server-read' });
    expect(result.current.resumePositionByChannel.general).toMatchObject({
      messageId: 'server-read',
      offset: 0,
    });
    expect(result.current.hasNewerByChannel.general).toBe(true);
  });

  it('loads older and newer edge pages through the application store', async () => {
    useAppStore.getState().set({ activeChannelId: 'general' });
    useAppStore.getState().setMessages('general', [message('middle')]);
    vi.mocked(api.listMessages)
      .mockResolvedValueOnce([message('old')])
      .mockResolvedValueOnce([message('new')]);
    const { result } = renderHook(() => useMessageHistory());

    await act(async () => result.current.loadOlder());
    await act(async () => result.current.loadNewer());

    expect(api.listMessages).toHaveBeenNthCalledWith(1, 'general', { before: 'middle' });
    expect(api.listMessages).toHaveBeenNthCalledWith(2, 'general', { after: 'middle' });
    expect(useAppStore.getState().messagesByChannel.general.map(({ id }) => id))
      .toEqual(['old', 'middle', 'new']);
  });

  it('debounces shared read markers per channel', async () => {
    vi.useFakeTimers();
    vi.mocked(api.markRead).mockResolvedValue({ success: true, lastReadMessageId: 'latest' });
    const { result, unmount } = renderHook(() => useMessageHistory());

    act(() => {
      result.current.saveReadPosition('general', 'first');
      result.current.saveReadPosition('general', 'latest');
    });
    await act(async () => vi.advanceTimersByTimeAsync(450));

    expect(api.markRead).toHaveBeenCalledTimes(1);
    expect(api.markRead).toHaveBeenCalledWith('general', 'latest');
    unmount();
    vi.useRealTimers();
  });
});
