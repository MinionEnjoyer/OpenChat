import { copyFileSync, existsSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { ConfigService } from '@nestjs/config';
import { HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
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

describe('ShareService boundary failures and media proxy', () => {
  const originalFetch = global.fetch;

  function makeService(options: {
    baseUrl?: string;
    apiKey?: string;
    user?: { authSub: string; username: string } | null;
  } = {}) {
    const values = new Map<string, string | undefined>([
      ['SHARE_BASE_URL', options.baseUrl === undefined ? 'http://share.internal' : options.baseUrl],
      ['SHARE_API_KEY', options.apiKey === undefined ? 'test-service-key' : options.apiKey],
    ]);
    const config = { get: jest.fn((key: string) => values.get(key)) } as unknown as ConfigService;
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(
          options.user === undefined
            ? { authSub: 'owner-sub', username: 'owner' }
            : options.user,
        ),
      },
    } as any;
    return { service: new ShareService(config, prisma), prisma };
  }

  function tempUpload(prefix: string, name = 'asset.png') {
    const tempDir = mkdtempSync(join(tmpdir(), prefix));
    const filePath = join(tempDir, name);
    copyFileSync(join(process.cwd(), 'test/fixtures/red-1x1.png'), filePath);
    return {
      filePath,
      input: { path: filePath, originalname: name, mimetype: 'image/png', size: 68 },
    };
  }

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('forwards byte ranges while filtering upstream response headers', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(
      new Uint8Array([1, 2, 3]),
      {
        status: 206,
        headers: {
          'content-type': 'application/octet-stream',
          'content-range': 'bytes 0-2/3',
          'accept-ranges': 'bytes',
          'x-upstream-private': 'must-not-pass',
        },
      },
    ));
    const { service } = makeService();

    const result = await service.proxyRaw('asset id', 'bytes=0-2');
    const chunks: Buffer[] = [];
    for await (const chunk of result.stream) chunks.push(Buffer.from(chunk));

    expect(fetchMock).toHaveBeenCalledWith('http://share.internal/raw/asset%20id', {
      headers: { range: 'bytes=0-2' },
    });
    expect(result.status).toBe(206);
    expect(Buffer.concat(chunks)).toEqual(Buffer.from([1, 2, 3]));
    expect(result.headers).toMatchObject({
      'content-type': 'application/octet-stream',
      'content-range': 'bytes 0-2/3',
      'accept-ranges': 'bytes',
      'cache-control': 'private, max-age=86400',
    });
    expect(result.headers).not.toHaveProperty('x-upstream-private');
  });

  it('maps missing raw and thumbnail assets to authenticated 404 responses', async () => {
    const { service } = makeService();
    jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response('{"detail":"missing"}', { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));

    await expect(service.proxyRaw('missing')).rejects.toMatchObject({
      status: HttpStatus.NOT_FOUND,
      response: 'Share proxy failed (404): {"detail":"missing"}',
    });
    await expect(service.proxyThumb('missing')).rejects.toMatchObject({
      status: HttpStatus.NOT_FOUND,
      response: 'Share thumb proxy failed (404)',
    });
  });

  it('returns rejected 422 files without failing the whole upload and removes temp data', async () => {
    const { filePath, input } = tempUpload('openchat-share-rejected-');
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('unsupported media', { status: 422 }));
    const { service } = makeService();

    const result = await service.uploadForUser('user-1', [input]);

    expect(result).toEqual({
      attachments: [],
      rejected: [{ name: 'asset.png', reason: 'unsupported media' }],
    });
    expect(existsSync(filePath)).toBe(false);
  });

  it('turns upstream authentication failures into a useful 502 and removes temp data', async () => {
    const { filePath, input } = tempUpload('openchat-share-auth-failure-');
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(
      '{"detail":"invalid service credentials"}',
      { status: 401 },
    ));
    const { service } = makeService();

    await expect(service.uploadForUser('user-1', [input])).rejects.toMatchObject({
      status: HttpStatus.BAD_GATEWAY,
      response: expect.stringContaining('invalid service credentials'),
    });
    expect(existsSync(filePath)).toBe(false);
  });

  it('keeps network failures generic and always removes spooled uploads', async () => {
    const { filePath, input } = tempUpload('openchat-share-network-failure-');
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.2'));
    const { service } = makeService();

    await expect(service.uploadForUser('user-1', [input])).rejects.toMatchObject({
      status: HttpStatus.BAD_GATEWAY,
      response: 'Could not reach file hosting',
    });
    expect(existsSync(filePath)).toBe(false);
  });

  it('rejects unconfigured hosting and unknown OpenChat users before calling upstream', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');
    const missingConfig = makeService({ baseUrl: '', apiKey: '' }).service;
    await expect(missingConfig.uploadForUser('user-1', [{} as never])).rejects.toMatchObject({
      status: HttpStatus.SERVICE_UNAVAILABLE,
    });

    const unknownUser = makeService({ user: null }).service;
    await expect(unknownUser.uploadForUser('missing-user', [{} as never]))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('authenticates waveform analysis and cleans its temporary file on success', async () => {
    const { filePath, input } = tempUpload('openchat-share-waveform-', 'sound.wav');
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ peaks: [0, 50, 100], duration: 0.5 }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));
    const { service } = makeService();

    await expect(service.analyzeWaveformForUser('user-1', input)).resolves.toEqual({
      peaks: [0, 50, 100],
      duration: 0.5,
    });
    expect(fetchMock).toHaveBeenCalledWith('http://share.internal/waveform', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        Authorization: 'Bearer test-service-key',
        'X-Share-User-Sub': 'owner-sub',
        'X-Share-User-Name': 'owner',
      }),
    }));
    expect(existsSync(filePath)).toBe(false);
  });

  it('cleans waveform temp data when OpenShare rejects processing', async () => {
    const { filePath, input } = tempUpload('openchat-share-waveform-failure-', 'sound.wav');
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 413 }));
    const { service } = makeService();

    await expect(service.analyzeWaveformForUser('user-1', input)).rejects.toBeInstanceOf(HttpException);
    expect(existsSync(filePath)).toBe(false);
  });
});
