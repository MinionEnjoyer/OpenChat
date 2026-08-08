import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EmojiPicker } from './EmojiPicker';
import { GifPicker } from './GifPicker';
import { StickerPicker } from './StickerPicker';
import { ChatOptionsTray } from './ChatOptionsTray';

vi.mock('../lib/api', () => ({
  gifSearch: vi.fn().mockResolvedValue([]),
  listStickers: vi.fn().mockResolvedValue([]),
  addSticker: vi.fn(),
  deleteSticker: vi.fn(),
}));

describe('chat panel anchoring contract', () => {
  it.each([
    ['Choose a GIF', <GifPicker key="gif" onSelect={vi.fn()} onClose={vi.fn()} />],
    ['Choose a sticker', <StickerPicker key="sticker" serverId="server-1" canManage={false} onSelect={vi.fn()} onClose={vi.fn()} />],
    ['Choose an emoji', <EmojiPicker key="emoji" onSelect={vi.fn()} onClose={vi.fn()} />],
  ])('renders %s from the shared centered surface', (label, panel) => {
    const { unmount } = render(panel);

    expect(screen.getByRole('dialog', { name: label })).toHaveClass('chat-option-dialog');
    expect(document.querySelector('.chat-option-backdrop')).toBeInTheDocument();
    unmount();
  });

  it('keeps only the vertical option selector on the composer anchor', () => {
    render(<ChatOptionsTray
      shareBaseUrl=""
      serverId={null}
      onUploaded={vi.fn()}
      onCreatePoll={vi.fn()}
      onOpenTool={vi.fn()}
    />);
    fireEvent.click(screen.getByRole('button', { name: 'Chat options' }));

    expect(screen.getByRole('menu', { name: 'Chat options' })).toHaveClass('chat-options-menu');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
