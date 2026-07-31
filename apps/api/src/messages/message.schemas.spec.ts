import { CreateMessageSchema } from './message.schemas';

describe('CreateMessageSchema', () => {
  it('accepts OpenChat media proxy attachment URLs', () => {
    const parsed = CreateMessageSchema.parse({
      content: 'attached',
      attachments: [{
        shareAssetId: 'asset',
        filename: 'photo.png',
        mimeType: 'image/png',
        size: '123',
        url: '/api/media/asset/raw',
        thumbnailUrl: '/api/media/asset/thumb',
      }],
    });
    expect(parsed.attachments[0].size).toBe(123n);
  });

  it('rejects oversized WebSocket messages at the shared service boundary', () => {
    expect(() => CreateMessageSchema.parse({ content: 'x'.repeat(4001) })).toThrow();
    expect(() => CreateMessageSchema.parse({
      content: 'too many',
      attachments: Array.from({ length: 11 }, (_, i) => ({
        shareAssetId: String(i), filename: `${i}.png`, mimeType: 'image/png', size: 1,
        url: `/api/media/${i}/raw`,
      })),
    })).toThrow();
  });

  it('rejects scriptable and malformed attachment URLs', () => {
    expect(() => CreateMessageSchema.parse({
      content: 'bad',
      attachments: [{
        shareAssetId: 'asset', filename: 'x', mimeType: 'text/html', size: 1,
        url: 'javascript:alert(1)',
      }],
    })).toThrow();
  });
});
