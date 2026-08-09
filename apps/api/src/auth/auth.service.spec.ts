import {
  BadRequestException, ConflictException, NotFoundException, UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { Issuer } from 'openid-client';
import { AuthService } from './auth.service';

jest.mock('openid-client', () => ({
  Issuer: { discover: jest.fn() },
  generators: {
    state: jest.fn(() => 'state-1'),
    codeVerifier: jest.fn(() => 'verifier-1'),
    nonce: jest.fn(() => 'nonce-1'),
    codeChallenge: jest.fn(() => 'challenge-1'),
  },
}));

describe('AuthService', () => {
  const baseUser = {
    id: 'user-1', authSub: 'subject-1', username: 'user', displayName: 'User',
    avatarUrl: null, friendCode: '12345678', status: 'ONLINE',
  };

  function makeService() {
    const values: Record<string, string | undefined> = {
      OIDC_ISSUER: 'https://idp.test/application/o/openchat/',
      OIDC_CLIENT_ID: 'client-id', OIDC_CLIENT_SECRET: 'client-secret',
      OIDC_REDIRECT_URI: 'https://chat.test/api/auth/callback',
      OIDC_POST_LOGOUT_REDIRECT_URI: 'https://chat.test/',
      NATIVE_REDIRECT_URI: 'openchat://auth',
    };
    const config = {
      get: jest.fn((key: string) => values[key]),
      getOrThrow: jest.fn((key: string) => {
        if (!values[key]) throw new Error(`missing ${key}`);
        return values[key];
      }),
    } as any;
    const prisma = {
      user: {
        upsert: jest.fn().mockResolvedValue(baseUser),
        findUnique: jest.fn().mockResolvedValue(baseUser),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue(baseUser),
      },
      apiToken: {
        create: jest.fn().mockResolvedValue({ id: 'token-1', name: 'Desktop', createdAt: new Date() }),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue({ userId: 'user-1' }),
        update: jest.fn().mockResolvedValue({}),
      },
    } as any;
    const redis = {
      setEx: jest.fn().mockResolvedValue('OK'), get: jest.fn().mockResolvedValue(null),
      del: jest.fn().mockResolvedValue(1),
    } as any;
    const client = {
      authorizationUrl: jest.fn().mockReturnValue('https://idp.test/authorize'),
      callback: jest.fn().mockResolvedValue({ access_token: 'access', id_token: 'id-token' }),
      userinfo: jest.fn().mockResolvedValue({ sub: 'subject-1', preferred_username: 'user' }),
      endSessionUrl: jest.fn().mockReturnValue('https://idp.test/logout'),
    } as any;
    const service = new AuthService(config, prisma, redis);
    (service as any).client = client;
    return { service, config, prisma, redis, client, values };
  }

  beforeEach(() => jest.clearAllMocks());

  it('discovers and caches the OIDC client, including deferred boot failure', async () => {
    const { service, client } = makeService();
    (service as any).client = undefined;
    const Client = jest.fn(() => client);
    (Issuer.discover as jest.Mock).mockResolvedValue({ Client });

    await service.onModuleInit();
    await new Promise((resolve) => setImmediate(resolve));
    await expect((service as any).getClient()).resolves.toBe(client);
    expect(Issuer.discover).toHaveBeenCalledTimes(1);
    expect(Client).toHaveBeenCalledWith(expect.objectContaining({
      client_id: 'client-id', client_secret: 'client-secret', response_types: ['code'],
    }));

    const failed = makeService();
    (failed.service as any).client = undefined;
    (Issuer.discover as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    await failed.service.onModuleInit();
    await new Promise((resolve) => setImmediate(resolve));
    expect((failed.service as any).discovering).toBeUndefined();
  });

  it('begins an OIDC login with state, nonce, and PKCE stored in session', async () => {
    const { service, client } = makeService();
    const session: any = {};
    await expect(service.beginLogin(session)).resolves.toBe('https://idp.test/authorize');
    expect(session.oidc).toEqual({ state: 'state-1', codeVerifier: 'verifier-1', nonce: 'nonce-1' });
    expect(client.authorizationUrl).toHaveBeenCalledWith(expect.objectContaining({
      scope: 'openid profile email', state: 'state-1', nonce: 'nonce-1',
      code_challenge: 'challenge-1', code_challenge_method: 'S256',
    }));
  });

  it('completes OIDC login through the shared claims path and consumes session state', async () => {
    const { service, client, prisma } = makeService();
    const session: any = { oidc: { state: 'state', codeVerifier: 'verifier', nonce: 'nonce' } };
    await expect(service.completeLogin(session, { code: 'code-1' })).resolves.toEqual({
      userId: 'user-1', idToken: 'id-token',
    });
    expect(client.callback).toHaveBeenCalledWith(
      'https://chat.test/api/auth/callback', { code: 'code-1' },
      { state: 'state', nonce: 'nonce', code_verifier: 'verifier' },
    );
    expect(prisma.user.upsert).toHaveBeenCalled();
    expect(session.oidc).toBeUndefined();

    await expect(service.completeLogin({} as any, {})).rejects.toBeInstanceOf(UnauthorizedException);
    client.callback.mockResolvedValue({ id_token: 'id' });
    await expect(service.completeLogin({ oidc: session.oidc ?? { state: 's', codeVerifier: 'v', nonce: 'n' } } as any, {}))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('maps claims to stable local profiles without overwriting customizations', async () => {
    const { service, prisma } = makeService();
    await service.loginFromClaims({ sub: 'abc123456789', email: 'mail@example.test', picture: '/pic' });
    expect(prisma.user.upsert).toHaveBeenCalledWith({
      where: { authSub: 'abc123456789' }, update: {},
      create: {
        authSub: 'abc123456789', username: 'mail', displayName: 'mail', avatarUrl: '/pic',
      },
    });
    await service.loginFromClaims({ sub: 'abcdefghijk' });
    expect(prisma.user.upsert).toHaveBeenLastCalledWith(expect.objectContaining({
      create: expect.objectContaining({ username: 'user_abcdefgh' }),
    }));
  });

  it('validates native redirect URIs and exchanges native PKCE codes', async () => {
    const { service, client } = makeService();
    await expect(service.exchangeNativeCode('code', 'verifier', 'wrong://redirect'))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(service.exchangeNativeCode('code', 'verifier', 'openchat://auth')).resolves.toEqual(baseUser);
    expect(client.callback).toHaveBeenCalledWith('openchat://auth', { code: 'code' }, { code_verifier: 'verifier' });
    client.callback.mockResolvedValue({});
    await expect(service.exchangeNativeCode('code', 'verifier', 'openchat://auth'))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('publishes only safe OIDC metadata and builds logout URLs', async () => {
    const { service, client } = makeService();
    expect(service.oidcMetadata()).toEqual({
      issuer: 'https://idp.test/application/o/openchat/', clientId: 'client-id',
      nativeRedirectUri: 'openchat://auth', scopes: ['openid', 'profile', 'email'],
    });
    await expect(service.endSessionUrl('id-token')).resolves.toBe('https://idp.test/logout');
    expect(client.endSessionUrl).toHaveBeenCalledWith({
      id_token_hint: 'id-token', post_logout_redirect_uri: 'https://chat.test/',
    });
  });

  it('dev-login and current-user responses never expose authSub', async () => {
    const { service, prisma } = makeService();
    await expect(service.devLogin('developer')).resolves.not.toHaveProperty('authSub');
    expect(prisma.user.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { authSub: 'dev:developer' },
    }));
    await expect(service.getCurrentUser('user-1')).resolves.not.toHaveProperty('authSub');
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.getCurrentUser('missing')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('lazily backfills missing friend codes and retries collisions', async () => {
    const { service, prisma } = makeService();
    prisma.user.findUnique
      .mockResolvedValueOnce({ ...baseUser, friendCode: null })
      .mockResolvedValueOnce({ id: 'collision' })
      .mockResolvedValueOnce(null);
    prisma.user.update.mockImplementation(({ data }: any) => Promise.resolve({ ...baseUser, friendCode: data.friendCode }));
    const result = await service.getCurrentUser('user-1');
    expect(result.friendCode).toMatch(/^\d{8}$/);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' }, data: { friendCode: expect.stringMatching(/^\d{8}$/) },
    });
  });

  it('validates profile status, username syntax, and uniqueness', async () => {
    const invalidStatus = makeService();
    await expect(invalidStatus.service.updateProfile('user-1', { status: 'BUSY' }))
      .rejects.toBeInstanceOf(BadRequestException);
    const invalidName = makeService();
    await expect(invalidName.service.updateProfile('user-1', { username: 'x!' }))
      .rejects.toBeInstanceOf(BadRequestException);
    const clash = makeService();
    clash.prisma.user.findFirst.mockResolvedValue({ id: 'other' });
    await expect(clash.service.updateProfile('user-1', { username: 'TakenName' }))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it('updates every supported profile field and normalizes empty optional values', async () => {
    const { service, prisma } = makeService();
    prisma.user.update.mockResolvedValue({ ...baseUser, username: 'New.Name' });
    await expect(service.updateProfile('user-1', {
      username: ' New.Name ', displayName: '', avatarUrl: '', status: 'AWAY', customStatus: '', bio: '',
    })).resolves.not.toHaveProperty('authSub');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        username: 'New.Name', displayName: null, avatarUrl: null, status: 'AWAY', customStatus: null, bio: null,
      },
    });
  });

  it('persists opaque server layout while returning a safe user', async () => {
    const { service, prisma } = makeService();
    await expect(service.updateServerLayout('user-1', { folders: [] })).resolves.not.toHaveProperty('authSub');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' }, data: { serverLayout: { folders: [] } },
    });
  });

  it('mints and verifies single-use desktop PKCE codes', async () => {
    const { service, redis, prisma } = makeService();
    const verifier = 'desktop-verifier';
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const code = await service.generateDesktopPkceCode('user-1', challenge);
    expect(code).toMatch(/^[a-f0-9]{48}$/);
    expect(redis.setEx).toHaveBeenCalledWith(
      `desktop_pkce:${code}`, JSON.stringify({ userId: 'user-1', codeChallenge: challenge }), 60,
    );

    redis.get.mockResolvedValue(JSON.stringify({ userId: 'user-1', codeChallenge: challenge }));
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
    await expect(service.exchangeDesktopPkceCode(code, verifier)).resolves.toEqual({ id: 'user-1' });
    expect(redis.del).toHaveBeenCalledWith(`desktop_pkce:${code}`);

    redis.get.mockResolvedValue(JSON.stringify({ userId: 'user-1', codeChallenge: 'wrong' }));
    await expect(service.exchangeDesktopPkceCode(code, verifier)).resolves.toBeNull();
    redis.get.mockResolvedValue(null);
    await expect(service.exchangeDesktopPkceCode(code, verifier)).resolves.toBeNull();
  });

  it('mints and consumes single-use WebSocket tickets', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-09T00:00:00.000Z'));
    const { service, redis } = makeService();
    const issued = await service.mintWsTicket('user-1');
    expect(issued.ticket).toMatch(/^[a-f0-9]{64}$/);
    expect(issued.expiresAt).toBe('2026-08-09T00:00:30.000Z');
    redis.get.mockResolvedValue('user-1');
    await expect(service.verifyWsTicket(issued.ticket)).resolves.toBe('user-1');
    expect(redis.del).toHaveBeenCalledWith(`ws_ticket:${issued.ticket}`);
    redis.get.mockResolvedValue(null);
    await expect(service.verifyWsTicket('missing')).resolves.toBeNull();
    jest.useRealTimers();
  });

  it('creates, lists, and owner-revokes hashed personal app tokens', async () => {
    const { service, prisma } = makeService();
    const created = await service.createToken('user-1', 'x'.repeat(70));
    expect(created.token).toMatch(/^oc_/);
    expect(prisma.apiToken.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1', name: 'x'.repeat(60), tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
      select: { id: true, name: true, createdAt: true },
    });
    service.listTokens('user-1');
    expect(prisma.apiToken.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {
      userId: 'user-1', revokedAt: null,
    } }));
    await expect(service.revokeToken('user-1', 'token-1')).resolves.toEqual({ success: true });
    expect(prisma.apiToken.update).toHaveBeenCalledWith({
      where: { id: 'token-1' }, data: { revokedAt: expect.any(Date) },
    });
    prisma.apiToken.findUnique.mockResolvedValue({ userId: 'other' });
    await expect(service.revokeToken('user-1', 'token-1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
