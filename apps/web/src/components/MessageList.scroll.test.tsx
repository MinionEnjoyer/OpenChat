import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Message } from '../lib/types';
import { MessageList, type MessageListProps } from './MessageList';

vi.mock('./MessageRow', () => ({
  MessageRow: ({ message }: { message: Message }) => (
    <div data-message-id={message.id}>{message.content}</div>
  ),
}));

vi.mock('./OpenChatSpinner', () => ({
  OpenChatSpinner: () => <span>Loading</span>,
}));

const rect = (top: number, bottom: number): DOMRect => ({
  x: 0,
  y: top,
  top,
  bottom,
  left: 0,
  right: 320,
  width: 320,
  height: bottom - top,
  toJSON: () => ({}),
});

function message(id: string, channelId = 'general'): Message {
  return {
    id,
    channelId,
    content: id,
    kind: 'USER',
    authorId: 'user-2',
    createdAt: '2026-08-01T00:00:00.000Z',
    editedAt: null,
    deletedAt: null,
    replyToId: null,
    replyTo: null,
    pinned: false,
    attachments: [],
    reactions: [],
    author: { id: 'user-2', username: 'reader', displayName: null, avatarUrl: null, status: 'ONLINE' },
  };
}

function props(overrides: Partial<MessageListProps>): MessageListProps {
  return {
    messages: [],
    channelId: 'general',
    resumePosition: undefined,
    hasMore: false,
    hasNewer: false,
    loadingOlder: false,
    loadingNewer: false,
    onLoadOlder: vi.fn(),
    onLoadNewer: vi.fn(),
    onReadPosition: vi.fn(),
    onScrollPosition: vi.fn(),
    scrollCaptureRef: { current: null },
    meId: 'user-1',
    myUsername: 'tester',
    shareBaseUrl: '',
    mentionNames: new Set(),
    canDeleteAny: false,
    canPin: false,
    editingId: null,
    onToggleReaction: vi.fn(),
    onReply: vi.fn(),
    onStartEdit: vi.fn(),
    onSaveEdit: vi.fn(),
    onCancelEdit: vi.fn(),
    onPin: vi.fn(),
    onDelete: vi.fn(),
    onPollVote: vi.fn(),
    onOpenReactionPicker: vi.fn(),
    ...overrides,
  };
}

describe('MessageList channel scroll restoration', () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains('msg-scroll')) return rect(0, 200);
      if (this.dataset.messageId === 'message-40') return rect(74, 94);
      return rect(0, 20);
    });
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(1000);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(200);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('waits for the saved anchor row before completing restoration', () => {
    const resumePosition = { messageId: 'message-40', offset: 18, updatedAt: 1 };
    const initial = props({ resumePosition });
    const { container, rerender } = render(<MessageList {...initial} />);
    const scroller = container.querySelector<HTMLElement>('.msg-scroll')!;

    expect(scroller.scrollTop).toBe(0);

    rerender(<MessageList {...initial} messages={[message('message-40')]} />);

    expect(scroller.scrollTop).toBe(56);
  });

  it('uses the newest edge only after a channel load resolves without an anchor', () => {
    const initial = props({ resumePosition: undefined });
    const { container, rerender } = render(<MessageList {...initial} />);
    const scroller = container.querySelector<HTMLElement>('.msg-scroll')!;

    expect(scroller.scrollTop).toBe(0);

    rerender(<MessageList {...initial} resumePosition={null} messages={[message('message-50')]} />);

    expect(scroller.scrollTop).toBe(1000);
  });

  it('re-arms restoration when the same channel starts a fresh load', () => {
    const resumePosition = { messageId: 'message-40', offset: 18, updatedAt: 1 };
    const initial = props({ resumePosition, messages: [message('message-40')] });
    const { container, rerender } = render(<MessageList {...initial} />);
    const scroller = container.querySelector<HTMLElement>('.msg-scroll')!;
    expect(scroller.scrollTop).toBe(56);

    scroller.scrollTop = 0;
    rerender(<MessageList {...initial} resumePosition={undefined} />);
    expect(scroller.scrollTop).toBe(0);

    rerender(<MessageList {...initial} />);
    expect(scroller.scrollTop).toBe(56);
  });

  it('does not load older history from a transient top scroll while restoring', () => {
    const onLoadOlder = vi.fn();
    const initial = props({
      resumePosition: undefined,
      messages: [message('message-40')],
      hasMore: true,
      onLoadOlder,
    });
    const { container } = render(<MessageList {...initial} />);
    const scroller = container.querySelector<HTMLElement>('.msg-scroll')!;

    scroller.scrollTop = 0;
    fireEvent.scroll(scroller);

    expect(onLoadOlder).not.toHaveBeenCalled();
  });

  it('captures the visible anchor synchronously before switching channels', () => {
    const onScrollPosition = vi.fn();
    const scrollCaptureRef = { current: null as (() => void) | null };
    const general = props({
      channelId: 'general',
      resumePosition: null,
      messages: [message('message-40')],
      onScrollPosition,
      scrollCaptureRef,
    });
    render(<MessageList {...general} />);

    scrollCaptureRef.current?.();

    expect(onScrollPosition).toHaveBeenCalledWith('general', 'message-40', 74);
  });

  it('keeps the private-conversation introduction inside the scrollable history', () => {
    render(<MessageList
      {...props({ messages: [message('message-1', 'dm-1')], channelId: 'dm-1', resumePosition: null })}
      conversationIntro={<section aria-label="Beginning of conversation with Morgan">Private conversation</section>}
    />);

    const intro = screen.getByLabelText('Beginning of conversation with Morgan');
    const row = screen.getByText('message-1');
    expect(intro.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(intro.closest('.msg-scroll')).not.toBeNull();
  });
});
