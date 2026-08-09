import type { ConfigService } from '@nestjs/config';
import { FcmPushTransport } from './fcm-push.transport';

describe('FcmPushTransport', () => {
  const originalFetch = global.fetch;
  const account = JSON.stringify({
    project_id: 'openchat-test',
    client_email: 'firebase@example.test',
    private_key: '-----BEGIN PRIVATE KEY-----\nAA==\n-----END PRIVATE KEY-----',
  });

  function transport(...args: [raw?: string]) {
    const raw = args.length ? args[0] : account;
    const config = { get: jest.fn().mockReturnValue(raw) } as unknown as ConfigService;
    return new FcmPushTransport(config);
  }

  function mockAccessToken(instance: FcmPushTransport, token = 'oauth-token') {
    jest.spyOn(instance as any, 'createJwt').mockResolvedValue('signed-jwt');
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
      access_token: token, expires_in: 3600,
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
  }

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('degrades absent credentials and empty batches into safe no-ops', async () => {
    await expect(transport(undefined).sendPush(['token'], { title: 'Title', body: 'Body' }))
      .resolves.toEqual({ success: 0, invalidTokens: [] });
    await expect(transport().sendPush([], { title: 'Title', body: 'Body' }))
      .resolves.toEqual({ success: 0, invalidTokens: [] });
  });

  it('fails fast on malformed credentials and missing project identity', () => {
    expect(() => transport('{bad json')).toThrow('FCM_SERVICE_ACCOUNT is not valid JSON');
    expect(() => transport(JSON.stringify({ client_email: 'x', private_key: 'y' })))
      .toThrow('Missing project_id in service account');
  });

  it('sends complete Android/APNs/data payloads and counts successful recipients', async () => {
    const instance = transport();
    mockAccessToken(instance);
    (global.fetch as jest.Mock).mockResolvedValueOnce(new Response('{}', { status: 200 }));

    await expect(instance.sendPush(['device-1'], {
      title: 'New message', body: 'Hello', data: { channelId: 'channel-1' },
      android: { channelId: 'messages', priority: 'high' },
      apns: {
        headers: { 'apns-priority': '10' },
        payload: { aps: { alert: { title: 'New message', body: 'Hello' }, sound: 'default' } },
      },
    })).resolves.toEqual({ success: 1, invalidTokens: [] });

    expect(global.fetch).toHaveBeenNthCalledWith(2,
      'https://fcm.googleapis.com/v1/projects/openchat-test/messages:send',
      expect.objectContaining({
        method: 'POST',
        headers: { Authorization: 'Bearer oauth-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: {
          token: 'device-1', notification: { title: 'New message', body: 'Hello' },
          data: { channelId: 'channel-1' },
          android: { notification: { channel_id: 'messages' } },
          apns: {
            headers: { 'apns-priority': '10' },
            payload: { aps: { alert: { title: 'New message', body: 'Hello' }, sound: 'default' } },
          },
        } }),
      }),
    );
  });

  it('classifies invalid tokens without pruning transient provider failures', async () => {
    const instance = transport();
    mockAccessToken(instance);
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(new Response('{}', { status: 404 }))
      .mockResolvedValueOnce(new Response('UNREGISTERED', { status: 400 }))
      .mockResolvedValueOnce(new Response('INVALID_ARGUMENT', { status: 400 }))
      .mockResolvedValueOnce(new Response('registration-token-not-registered', { status: 400 }))
      .mockResolvedValueOnce(new Response('temporary outage', { status: 503 }))
      .mockRejectedValueOnce(new Error('network reset'))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));

    await expect(instance.sendPush(
      ['gone-404', 'gone-unregistered', 'gone-invalid', 'gone-legacy', 'retry-http', 'retry-network', 'valid'],
      { title: 'Title', body: 'Body' },
    )).resolves.toEqual({
      success: 1,
      invalidTokens: ['gone-404', 'gone-unregistered', 'gone-invalid', 'gone-legacy'],
    });
  });

  it('caches OAuth access tokens until the refresh safety window', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-09T00:00:00.000Z'));
    const instance = transport();
    mockAccessToken(instance);
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));

    await instance.sendPush(['one'], { title: 'T', body: 'B' });
    await instance.sendPush(['two'], { title: 'T', body: 'B' });
    expect((instance as any).createJwt).toHaveBeenCalledTimes(1);
    expect((global.fetch as jest.Mock).mock.calls.filter(([url]) => String(url).includes('oauth2.googleapis.com')))
      .toHaveLength(1);
  });

  it('surfaces OAuth provider failures before sending device messages', async () => {
    const instance = transport();
    jest.spyOn(instance as any, 'createJwt').mockResolvedValue('signed-jwt');
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('invalid_grant', { status: 401 }));
    await expect(instance.sendPush(['device'], { title: 'T', body: 'B' }))
      .rejects.toThrow('Failed to obtain FCM access token: 401 invalid_grant');
  });

  it('creates RFC 7523 JWTs using the configured PKCS8 signing key', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-09T00:00:00.000Z'));
    const instance = transport();
    const importKey = jest.spyOn(crypto.subtle, 'importKey').mockResolvedValue({} as CryptoKey);
    jest.spyOn(crypto.subtle, 'sign').mockResolvedValue(new Uint8Array([1, 2, 3]).buffer);

    const jwt = await (instance as any).createJwt();
    const [encodedHeader, encodedClaims, signature] = jwt.split('.');
    expect(JSON.parse(Buffer.from(encodedHeader, 'base64url').toString())).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(JSON.parse(Buffer.from(encodedClaims, 'base64url').toString())).toEqual(expect.objectContaining({
      iss: 'firebase@example.test',
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
    }));
    expect(signature).toBe(Buffer.from([1, 2, 3]).toString('base64url'));
    expect(importKey).toHaveBeenCalledWith(
      'pkcs8', Buffer.from([0]),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'],
    );
  });
});
