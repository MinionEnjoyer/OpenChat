import { UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from './auth.guard';
import { SessionGuard } from './session.guard';

function context(request: any) {
  return { switchToHttp: () => ({ getRequest: () => request }) } as any;
}

describe('AuthGuard', () => {
  const user = { id: 'user-1', authSub: 'secret-sub', username: 'user' };
  function harness() {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(user) },
      apiToken: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
    } as any;
    const tokens = { verifyAccess: jest.fn().mockResolvedValue(null) } as any;
    return { guard: new AuthGuard(prisma, tokens), prisma, tokens };
  }

  it('authenticates a native JWT and strips authSub', async () => {
    const { guard, tokens } = harness();
    tokens.verifyAccess.mockResolvedValue('user-1');
    const request = { headers: { authorization: 'Bearer jwt' } };
    await expect(guard.canActivate(context(request))).resolves.toBe(true);
    expect(request).toHaveProperty('user', { id: 'user-1', username: 'user' });
  });

  it('rejects JWT identities that no longer exist', async () => {
    const { guard, prisma, tokens } = harness();
    tokens.verifyAccess.mockResolvedValue('missing');
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(guard.canActivate(context({ headers: { authorization: 'Bearer jwt' } })))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('falls back from JWT verification to a live personal token and throttles usage writes', async () => {
    const { guard, prisma } = harness();
    prisma.apiToken.findUnique.mockResolvedValue({
      id: 'token-1', user, revokedAt: null, expiresAt: null, lastUsedAt: null,
    });
    const request = { headers: { authorization: 'Bearer oc_token' } };
    await expect(guard.canActivate(context(request))).resolves.toBe(true);
    expect(prisma.apiToken.update).toHaveBeenCalledWith({
      where: { id: 'token-1' }, data: { lastUsedAt: expect.any(Date) },
    });

    prisma.apiToken.update.mockClear();
    prisma.apiToken.findUnique.mockResolvedValue({
      id: 'token-1', user, revokedAt: null, expiresAt: null, lastUsedAt: new Date(),
    });
    await guard.canActivate(context(request));
    expect(prisma.apiToken.update).not.toHaveBeenCalled();
  });

  it('falls through stale bearer tokens to a valid browser session', async () => {
    const { guard } = harness();
    const request = { headers: { authorization: 'Bearer stale' }, session: { userId: 'user-1' } };
    await expect(guard.canActivate(context(request))).resolves.toBe(true);
    expect(request).toHaveProperty('user', { id: 'user-1', username: 'user' });
  });

  it('rejects requests without valid token or session identities', async () => {
    const absent = harness();
    await expect(absent.guard.canActivate(context({ headers: {} }))).rejects.toBeInstanceOf(UnauthorizedException);
    const missing = harness();
    missing.prisma.user.findUnique.mockResolvedValue(null);
    await expect(missing.guard.canActivate(context({ headers: {}, session: { userId: 'missing' } })))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('SessionGuard', () => {
  const user = { id: 'user-1', authSub: 'secret-sub', username: 'user' };
  function harness() {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(user) },
      apiToken: {
        findUnique: jest.fn().mockResolvedValue(null), update: jest.fn().mockResolvedValue({}),
      },
    } as any;
    return { guard: new SessionGuard(prisma), prisma };
  }

  it('authenticates live personal tokens and sessions without exposing authSub', async () => {
    const token = harness();
    token.prisma.apiToken.findUnique.mockResolvedValue({
      id: 'token-1', user, revokedAt: null, expiresAt: null, lastUsedAt: null,
    });
    const tokenRequest = { headers: { authorization: 'Bearer oc_token' } };
    await expect(token.guard.canActivate(context(tokenRequest))).resolves.toBe(true);
    expect(tokenRequest).toHaveProperty('user', { id: 'user-1', username: 'user' });

    const session = harness();
    const sessionRequest = { headers: {}, session: { userId: 'user-1' } };
    await expect(session.guard.canActivate(context(sessionRequest))).resolves.toBe(true);
  });

  it('rejects missing, revoked, and expired personal tokens', async () => {
    for (const value of [
      null,
      { user, revokedAt: new Date(), expiresAt: null },
      { user, revokedAt: null, expiresAt: new Date(Date.now() - 1000) },
    ]) {
      const { guard, prisma } = harness();
      prisma.apiToken.findUnique.mockResolvedValue(value);
      await expect(guard.canActivate(context({ headers: { authorization: 'Bearer bad' } })))
        .rejects.toBeInstanceOf(UnauthorizedException);
    }
  });

  it('rejects missing sessions and deleted session users', async () => {
    const absent = harness();
    await expect(absent.guard.canActivate(context({ headers: {} }))).rejects.toBeInstanceOf(UnauthorizedException);
    const deleted = harness();
    deleted.prisma.user.findUnique.mockResolvedValue(null);
    await expect(deleted.guard.canActivate(context({ headers: {}, session: { userId: 'missing' } })))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });
});
