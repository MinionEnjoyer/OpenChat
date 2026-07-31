import { copyFileSync, existsSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ConfigService } from '@nestjs/config';
import { ShareService } from './share.service';

describe('ShareService sticker upload path', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('streams uploads directly to the scoped Share endpoint without dev-login', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'openchat-share-test-'));
    const filePath = join(tempDir, 'sticker.png');
    copyFileSync(join(process.cwd(), 'test/fixtures/red-1x1.png'), filePath);

    const config = {
      get: jest.fn((key: string) => ({
        SHARE_BASE_URL: 'http://share.internal',
        SHARE_API_KEY: 'service-secret',
      })[key]),
    } as unknown as ConfigService;
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ authSub: 'authentik-user-1', username: 'sticker-owner' }),
      },
    } as any;

    const requests: Array<{ url: string; init?: RequestInit }> = [];
    global.fetch = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), init });
      return new Response(JSON.stringify({ saved: [{ id: 'share-asset-1', media_type: 'image' }], rejected: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    const service = new ShareService(config, prisma);
    const result = await service.uploadForUser('chat-user-1', [{
      path: filePath,
      originalname: 'sticker.png',
      mimetype: 'image/png',
      size: 68,
    }]);

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe('http://share.internal/upload');
    expect(requests[0].url).not.toContain('dev-login');
    expect(requests[0].init?.headers).toMatchObject({
      Authorization: 'Bearer service-secret',
      'X-Share-User-Sub': 'authentik-user-1',
      'X-Share-User-Name': 'sticker-owner',
    });
    expect(result.attachments[0].url).toBe('/api/media/share-asset-1/raw');
    expect(result.rejected).toEqual([]);
    expect(existsSync(filePath)).toBe(false);
  });
});
