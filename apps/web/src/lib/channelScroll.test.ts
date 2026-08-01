import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('channel scroll persistence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('persists an independent message anchor and pixel offset per channel', async () => {
    const scroll = await import('./channelScroll');
    scroll.saveChannelScrollPosition('general', 'message-40', 17.6);
    scroll.saveChannelScrollPosition('random', 'message-8', -4.2);
    vi.advanceTimersByTime(120);

    vi.resetModules();
    const reloaded = await import('./channelScroll');
    expect(reloaded.getChannelScrollPosition('general')).toMatchObject({ messageId: 'message-40', offset: 18 });
    expect(reloaded.getChannelScrollPosition('random')).toMatchObject({ messageId: 'message-8', offset: -4 });
  });

  it('ignores invalid writes and clamps hostile stored offsets', async () => {
    localStorage.setItem('openchat.channelScroll.v1', JSON.stringify({
      general: { messageId: 'message-1', offset: 99_999, updatedAt: 1 },
    }));
    const scroll = await import('./channelScroll');
    expect(scroll.getChannelScrollPosition('general')?.offset).toBe(10_000);
    scroll.saveChannelScrollPosition('', 'message-2', 1);
    scroll.saveChannelScrollPosition('general', '', 1);
    scroll.saveChannelScrollPosition('general', 'message-2', Number.NaN);
    expect(scroll.getChannelScrollPosition('general')?.messageId).toBe('message-1');
  });
});
