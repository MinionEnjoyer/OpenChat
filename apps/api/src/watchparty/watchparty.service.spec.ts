import { once } from 'events';
import { PassThrough } from 'stream';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { WatchPartyService } from './watchparty.service';

describe('WatchPartyService', () => {
  const originalFetch = global.fetch;

  function party(overrides: Record<string, unknown> = {}) {
    return {
      id: 'party-1', channelId: 'channel-1', hostId: 'host-1', jellyfinItemId: 'video-1',
      itemName: 'Stored title', positionMs: 1200, paused: true, endedAt: null,
      host: { displayName: 'Host Name', username: 'host' },
      ...overrides,
    };
  }

  function makeService(options: {
    channel?: any; member?: any; recipient?: any; jellyfin?: boolean;
  } = {}) {
    const values: Record<string, string | undefined> = options.jellyfin === false
      ? {}
      : { JELLYFIN_URL: 'http://jellyfin.test/', JELLYFIN_API_KEY: 'jellyfin-key' };
    const config = { get: jest.fn((key: string) => values[key]) } as unknown as ConfigService;
    const prisma = {
      channel: {
        findUnique: jest.fn().mockResolvedValue(options.channel === undefined
          ? { id: 'channel-1', serverId: 'server-1' }
          : options.channel),
      },
      serverMember: {
        findUnique: jest.fn().mockResolvedValue(options.member === undefined ? { id: 'member-1' } : options.member),
      },
      channelRecipient: {
        findUnique: jest.fn().mockResolvedValue(options.recipient === undefined ? { userId: 'host-1' } : options.recipient),
      },
      watchParty: {
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue(party()),
        update: jest.fn().mockResolvedValue(party()),
      },
    } as any;
    const redis = { publish: jest.fn().mockResolvedValue(1) } as any;
    return { service: new WatchPartyService(config, prisma, redis), prisma, redis };
  }

  function responseHarness() {
    const response = new PassThrough() as PassThrough & {
      status: jest.Mock;
      setHeader: jest.Mock;
    };
    response.status = jest.fn().mockReturnValue(response);
    response.setHeader = jest.fn();
    return response;
  }

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('enforces channel existence and server or DM participation', async () => {
    await expect(makeService({ channel: null }).service.get('missing', 'user-1'))
      .rejects.toBeInstanceOf(NotFoundException);
    await expect(makeService({ member: null }).service.get('channel-1', 'user-1'))
      .rejects.toBeInstanceOf(ForbiddenException);
    await expect(makeService({ channel: { id: 'dm-1', serverId: null }, recipient: null }).service.get('dm-1', 'user-1'))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('requires Jellyfin configuration before browsing or proxying', async () => {
    const { service } = makeService({ jellyfin: false });
    await expect(service.search('anything')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('builds constrained Jellyfin searches and maps playable items', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      Items: [{
        Id: 'track-1', Name: 'Track', Type: 'Audio', SeriesName: 'Series',
        RunTimeTicks: 12_345_678, ImageTags: { Primary: 'hash' },
      }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const { service } = makeService();

    await expect(service.search('blue sky', 'music')).resolves.toEqual([{
      id: 'track-1', name: 'Track', type: 'Audio', seriesName: 'Series',
      runtimeMs: 1235, imageUrl: '/api/watchparty/image/track-1',
    }]);
    const [url, init] = fetchMock.mock.calls[0];
    const parsed = new URL(String(url));
    expect(parsed.origin + parsed.pathname).toBe('http://jellyfin.test/Items');
    expect(parsed.searchParams.get('IncludeItemTypes')).toBe('Audio');
    expect(parsed.searchParams.get('SortBy')).toBe('Album,SortName');
    expect(parsed.searchParams.get('searchTerm')).toBe('blue sky');
    expect(init).toEqual({ headers: { 'X-Emby-Token': 'jellyfin-key' } });
  });

  it('turns Jellyfin browse failures into a stable client error', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('unavailable', { status: 503 }));
    await expect(makeService().service.search('', 'movie')).rejects.toMatchObject({
      response: expect.objectContaining({ message: 'Jellyfin browse failed (503)', statusCode: 400 }),
    });
  });

  it('starts and publishes a YouTube party without contacting Jellyfin', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');
    const { service, prisma, redis } = makeService();
    prisma.watchParty.create.mockResolvedValue(party({ jellyfinItemId: 'yt:dQw4w9WgXcQ' }));

    await expect(service.start('channel-1', 'host-1', { youtubeId: 'dQw4w9WgXcQ' })).resolves.toMatchObject({
      source: 'youtube', youtubeId: 'dQw4w9WgXcQ', itemName: 'YouTube video', streamUrl: null,
    });
    expect(prisma.watchParty.updateMany).toHaveBeenCalledWith({
      where: { channelId: 'channel-1', endedAt: null }, data: { endedAt: expect.any(Date) },
    });
    expect(prisma.watchParty.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ jellyfinItemId: 'yt:dQw4w9WgXcQ', hostId: 'host-1' }),
    }));
    expect(redis.publish).toHaveBeenCalledWith('chat:events', expect.objectContaining({
      type: 'WATCHPARTY_SYNC', channelId: 'channel-1', state: expect.objectContaining({ source: 'youtube' }),
    }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('validates media selection and serializes Jellyfin audio streams', async () => {
    const { service, prisma } = makeService();
    await expect(service.start('channel-1', 'host-1', {})).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.start('channel-1', 'host-1', { youtubeId: 'bad!' })).rejects.toBeInstanceOf(BadRequestException);

    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ Name: 'A Song' }), {
      status: 200, headers: { 'content-type': 'application/json' },
    }));
    prisma.watchParty.create.mockResolvedValue(party({ jellyfinItemId: 'ja:track-1' }));
    await expect(service.start('channel-1', 'host-1', { itemId: 'track-1', audio: true })).resolves.toMatchObject({
      source: 'jellyfin', itemId: 'ja:track-1', itemName: 'A Song',
      streamUrl: '/api/watchparty/stream/track-1?kind=audio',
    });
  });

  it('returns null for no party and resolves active party display data', async () => {
    const empty = makeService();
    await expect(empty.service.get('channel-1', 'host-1')).resolves.toBeNull();

    const active = makeService();
    active.prisma.watchParty.findFirst.mockResolvedValue(party({ jellyfinItemId: 'yt:abc12345' }));
    await expect(active.service.get('channel-1', 'host-1')).resolves.toMatchObject({
      hostName: 'Host Name', source: 'youtube', youtubeId: 'abc12345', itemName: 'YouTube video',
    });
  });

  it('allows only the host to update state and clamps invalid positions', async () => {
    const missing = makeService();
    await expect(missing.service.updateState('channel-1', 'host-1', { positionMs: 1, paused: false }))
      .rejects.toBeInstanceOf(NotFoundException);

    const nonHost = makeService();
    nonHost.prisma.watchParty.findFirst.mockResolvedValue(party());
    await expect(nonHost.service.updateState('channel-1', 'viewer-1', { positionMs: 1, paused: false }))
      .rejects.toBeInstanceOf(ForbiddenException);

    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ Name: 'Movie' }), { status: 200 }));
    const host = makeService();
    host.prisma.watchParty.findFirst.mockResolvedValue(party());
    host.prisma.watchParty.update.mockResolvedValue(party({ positionMs: 0, paused: false }));
    await host.service.updateState('channel-1', 'host-1', { positionMs: -12.8, paused: false });
    expect(host.prisma.watchParty.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { positionMs: 0, paused: false },
    }));
    expect(host.redis.publish).toHaveBeenCalledWith('chat:events', expect.objectContaining({
      type: 'WATCHPARTY_SYNC', state: expect.objectContaining({ positionMs: 0, paused: false }),
    }));
  });

  it('allows only the host to stop, while treating an absent party as already stopped', async () => {
    const empty = makeService();
    await expect(empty.service.stop('channel-1', 'host-1')).resolves.toEqual({ success: true });
    expect(empty.redis.publish).not.toHaveBeenCalled();

    const nonHost = makeService();
    nonHost.prisma.watchParty.findFirst.mockResolvedValue(party());
    await expect(nonHost.service.stop('channel-1', 'viewer-1')).rejects.toBeInstanceOf(ForbiddenException);

    const host = makeService();
    host.prisma.watchParty.findFirst.mockResolvedValue(party());
    await expect(host.service.stop('channel-1', 'host-1')).resolves.toEqual({ success: true });
    expect(host.prisma.watchParty.update).toHaveBeenCalledWith({
      where: { id: 'party-1' }, data: { endedAt: expect.any(Date) },
    });
    expect(host.redis.publish).toHaveBeenCalledWith('chat:events', {
      type: 'WATCHPARTY_SYNC', channelId: 'channel-1', state: null,
    });
  });

  it('proxies poster and ranged media bytes while preserving only playback headers', async () => {
    const fetchMock = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2]), {
        status: 200, headers: { 'content-type': 'image/jpeg' },
      }))
      .mockResolvedValueOnce(new Response(new Uint8Array([3, 4, 5]), {
        status: 206,
        headers: {
          'content-type': 'video/mp4', 'content-length': '3',
          'content-range': 'bytes 0-2/3', 'accept-ranges': 'bytes', 'x-private': 'no',
        },
      }));
    const { service } = makeService();

    const imageResponse = responseHarness();
    const imageBytes: Buffer[] = [];
    imageResponse.on('data', (chunk) => imageBytes.push(Buffer.from(chunk)));
    const imageFinished = once(imageResponse, 'finish');
    await service.proxyImage('poster-1', imageResponse as never);
    await imageFinished;
    expect(Buffer.concat(imageBytes)).toEqual(Buffer.from([1, 2]));
    expect(imageResponse.setHeader).toHaveBeenCalledWith('cache-control', 'public, max-age=86400');

    const streamResponse = responseHarness();
    const streamBytes: Buffer[] = [];
    streamResponse.on('data', (chunk) => streamBytes.push(Buffer.from(chunk)));
    const streamFinished = once(streamResponse, 'finish');
    await service.proxyStream(
      'video-1',
      { headers: { range: 'bytes=0-2' }, query: {} } as never,
      streamResponse as never,
    );
    await streamFinished;
    expect(Buffer.concat(streamBytes)).toEqual(Buffer.from([3, 4, 5]));
    expect(streamResponse.status).toHaveBeenCalledWith(206);
    expect(streamResponse.setHeader).not.toHaveBeenCalledWith('x-private', expect.anything());
    expect(fetchMock.mock.calls[1][0]).toBe(
      'http://jellyfin.test/Videos/video-1/stream.mp4?container=mp4&videoCodec=h264&audioCodec=aac&audioChannels=2',
    );
    expect(fetchMock.mock.calls[1][1]).toEqual({
      headers: { 'X-Emby-Token': 'jellyfin-key', Range: 'bytes=0-2' },
    });
  });

  it('maps missing poster bodies to 404 and ends empty upstream streams cleanly', async () => {
    jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const { service } = makeService();
    const poster = responseHarness();
    await service.proxyImage('missing', poster as never);
    expect(poster.status).toHaveBeenCalledWith(404);

    const media = responseHarness();
    const finished = once(media, 'finish');
    await service.proxyStream('empty', { headers: {}, query: { kind: 'audio' } } as never, media as never);
    await finished;
    expect(media.status).toHaveBeenCalledWith(204);
  });
});
