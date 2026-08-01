import { copyFileSync, existsSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { ConfigService } from '@nestjs/config';
import { ShareService } from './share.service';

describe('ShareService sticker upload path', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('streams uploads through the stable scoped asset endpoint without dev-login', async () => {
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
      return new Response(JSON.stringify({
        id: 'share-asset-1', filename: 'sticker.png', mimeType: 'image/png', size: 68,
        width: 1, height: 1, durationMs: null,
      }), {
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
    expect(requests[0].url).toBe('http://share.internal/api/assets');
    expect(requests[0].url).not.toContain('dev-login');
    expect(requests[0].init?.headers).toMatchObject({
      Authorization: 'Bearer service-secret',
      'X-Share-User-Sub': 'authentik-user-1',
      'X-Share-User-Name': 'sticker-owner',
    });
    expect(result.attachments[0].url).toBe('/api/media/share-asset-1/raw');
    expect(result.attachments[0].width).toBe(1);
    expect(result.rejected).toEqual([]);
    expect(existsSync(filePath)).toBe(false);
  });

  it('falls back to the scoped upload endpoint when an older Share lacks /api/assets', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'openchat-share-fallback-test-'));
    const filePath = join(tempDir, 'sticker.png');
    copyFileSync(join(process.cwd(), 'test/fixtures/red-1x1.png'), filePath);
    const config = {
      get: jest.fn((key: string) => ({
        SHARE_BASE_URL: 'http://share.internal', SHARE_API_KEY: 'service-secret',
      })[key]),
    } as unknown as ConfigService;
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue({ authSub: 'sub-1', username: 'owner' }) } } as any;
    const urls: string[] = [];
    global.fetch = jest.fn(async (url: string | URL | Request) => {
      urls.push(String(url));
      if (String(url).endsWith('/api/assets')) return new Response('not found', { status: 404 });
      return new Response(JSON.stringify({ saved: [{ id: 'legacy-asset', media_type: 'image' }], rejected: [] }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    const result = await new ShareService(config, prisma).uploadForUser('chat-user-1', [{
      path: filePath, originalname: 'sticker.png', mimetype: 'image/png', size: 68,
    }]);

    expect(urls).toEqual(['http://share.internal/api/assets', 'http://share.internal/upload']);
    expect(urls.every((url) => !url.includes('dev-login'))).toBe(true);
    expect(result.attachments[0].shareAssetId).toBe('legacy-asset');
    expect(existsSync(filePath)).toBe(false);
  });
});
