import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../lib/api';
import { uploadToShare } from '../lib/share';
import { StickerPicker } from './StickerPicker';

vi.mock('../lib/api', () => ({
  listStickers: vi.fn(),
  addSticker: vi.fn(),
  deleteSticker: vi.fn(),
}));
vi.mock('../lib/share', () => ({ uploadToShare: vi.fn() }));

const existingSticker = { id: 'sticker-1', name: 'Wave', url: '/api/media/asset-1/raw' };

describe('StickerPicker', () => {
  beforeEach(() => {
    vi.mocked(api.listStickers).mockResolvedValue([existingSticker]);
    vi.mocked(api.addSticker).mockReset();
    vi.mocked(api.deleteSticker).mockReset();
    vi.mocked(uploadToShare).mockReset();
  });

  it('selects an existing sticker and hides management controls from regular members', async () => {
    const onSelect = vi.fn();
    render(<StickerPicker serverId="server-1" canManage={false} onSelect={onSelect} onClose={() => undefined} />);

    fireEvent.click(await screen.findByAltText('Wave'));
    expect(onSelect).toHaveBeenCalledWith('/api/media/asset-1/raw');
    expect(screen.queryByText('Manage')).not.toBeInTheDocument();
    expect(screen.queryByText('＋ Add sticker')).not.toBeInTheDocument();
  });

  it('uploads an image, registers it with the server, and adds it to the picker', async () => {
    vi.mocked(api.listStickers).mockResolvedValue([]);
    vi.spyOn(window, 'prompt').mockReturnValue('Party Parrot');
    vi.mocked(uploadToShare).mockResolvedValue({
      attachments: [{
        id: 'attachment-1', shareAssetId: 'asset-2', filename: 'party.png', mimeType: 'image/png',
        size: '68', url: '/api/media/asset-2/raw', thumbnailUrl: null, width: 1, height: 1,
        durationMs: null,
      }],
      rejected: [],
    });
    vi.mocked(api.addSticker).mockResolvedValue({
      id: 'sticker-2', name: 'Party Parrot', url: '/api/media/asset-2/raw',
    });
    const { container } = render(
      <StickerPicker serverId="server-1" canManage onSelect={() => undefined} onClose={() => undefined} />,
    );
    await screen.findByText('No stickers yet — add one below.');
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();

    fireEvent.change(input!, { target: { files: [new File(['png'], 'party.png', { type: 'image/png' })] } });

    await waitFor(() => expect(api.addSticker).toHaveBeenCalledWith('server-1', {
      name: 'Party Parrot', url: '/api/media/asset-2/raw',
    }));
    expect(await screen.findByAltText('Party Parrot')).toBeInTheDocument();
  });

  it('surfaces an upload rejection and does not register a broken sticker', async () => {
    vi.mocked(api.listStickers).mockResolvedValue([]);
    vi.spyOn(window, 'prompt').mockReturnValue('Too Big');
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    vi.mocked(uploadToShare).mockResolvedValue({
      attachments: [],
      rejected: [{ name: 'huge.png', reason: 'file exceeds configured limit' }],
    });
    const { container } = render(
      <StickerPicker serverId="server-1" canManage onSelect={() => undefined} onClose={() => undefined} />,
    );
    await screen.findByText('No stickers yet — add one below.');
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');

    fireEvent.change(input!, { target: { files: [new File(['png'], 'huge.png', { type: 'image/png' })] } });

    await waitFor(() => expect(alert).toHaveBeenCalledWith(
      'Could not add sticker: file exceeds configured limit',
    ));
    expect(api.addSticker).not.toHaveBeenCalled();
  });
});
