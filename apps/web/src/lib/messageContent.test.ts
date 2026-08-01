import { describe, expect, it } from 'vitest';
import { isStickerContent, messageSummary, stickerContent, stickerUrl } from './messageContent';

describe('sticker message wire format', () => {
  it('encodes and parses proxied OpenChat media URLs', () => {
    const content = stickerContent('/api/media/asset_123/raw');
    expect(content).toBe('sticker::/api/media/asset_123/raw');
    expect(stickerUrl(content)).toBe('/api/media/asset_123/raw');
    expect(isStickerContent(content)).toBe(true);
    expect(messageSummary(content)).toBe('Sticker');
  });

  it('accepts HTTPS sticker assets and rejects unsafe or arbitrary relative URLs', () => {
    expect(stickerUrl('sticker::https://share.example.com/raw/asset-1')).toBe('https://share.example.com/raw/asset-1');
    expect(stickerUrl('sticker::javascript:alert(1)')).toBeNull();
    expect(stickerUrl('sticker::/uploads/private.png')).toBeNull();
    expect(stickerUrl('ordinary message')).toBeNull();
  });
});
