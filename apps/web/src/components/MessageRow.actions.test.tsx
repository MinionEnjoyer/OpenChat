import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MessageRow, type MessageRowProps } from './MessageRow';

vi.mock('./Avatar', () => ({ Avatar: () => <div data-testid="avatar" /> }));
vi.mock('./MessageEmbeds', () => ({ MessageEmbeds: () => null, isSingleEmbedUrl: () => false }));

function props(): MessageRowProps {
  return {
    message: {
      id: 'message-1', channelId: 'channel-1', authorId: 'user-1', content: 'Hello',
      createdAt: new Date().toISOString(), editedAt: null, pinned: false, pending: false,
      failed: false, attachments: [], reactions: [], poll: null,
      author: { id: 'user-1', username: 'tester', displayName: 'Tester' },
    } as any,
    meId: 'user-1', myUsername: 'tester', shareBaseUrl: '', mentionNames: new Set(),
    isEditing: false, canDelete: true, canPin: true,
    onToggleReaction: vi.fn(), onReply: vi.fn(), onStartEdit: vi.fn(), onSaveEdit: vi.fn(),
    onCancelEdit: vi.fn(), onPin: vi.fn(), onDelete: vi.fn(), onPollVote: vi.fn(),
    onOpenReactionPicker: vi.fn(),
  };
}

describe('MessageRow mobile actions', () => {
  it('opens in the shared centered dialog instead of tap coordinates', () => {
    render(<MessageRow {...props()} />);

    fireEvent.click(screen.getByTitle('Message actions'));

    expect(screen.getByRole('dialog', { name: 'Message actions' })).toHaveClass('chat-option-dialog');
    expect(document.querySelector('.chat-option-backdrop')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reply/ })).toBeInTheDocument();
  });
});
