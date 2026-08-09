import { UnauthorizedException } from '@nestjs/common';
import { createHash } from 'crypto';
import { TokenService } from './token.service';

describe('TokenService', () => {
  function makeService() {
    const jwt = {
      signAsync: jest.fn().mockResolvedValue('access-jwt'),
      verifyAsync: jest.fn().mockResolvedValue({ sub: 'user-1', typ: 'access' }),
    } as any;
    const redis = {
      setEx: jest.fn().mockResolvedValue('OK'), get: jest.fn().mockResolvedValue(null),
      del: jest.fn().mockResolvedValue(1),
    } as any;
    return { service: new TokenService(jwt, redis), jwt, redis };
  }

  it('issues a refresh family and access token with bounded expirations', async () => {
    const { service, jwt, redis } = makeService();
    const issued = await service.issueFamily('user-1');
    expect(issued).toMatchObject({ accessToken: 'access-jwt', expiresIn: 3600 });
    expect(issued.refreshToken).toMatch(/^[a-f0-9]{64}$/);
    expect(redis.setEx).toHaveBeenNthCalledWith(1, expect.stringMatching(/^rtfam:[a-f0-9]{32}$/), '1', 2592000);
    expect(redis.setEx).toHaveBeenNthCalledWith(2, expect.stringMatching(/^rt:[a-f0-9]{64}$/), expect.stringContaining('user-1'), 2592000);
    expect(jwt.signAsync).toHaveBeenCalledWith({ typ: 'access' }, { subject: 'user-1', expiresIn: 3600 });
  });

  it('rotates an unspent token inside a live family and marks the old token spent', async () => {
    const { service, redis } = makeService();
    const raw = 'refresh-token';
    const hash = createHash('sha256').update(raw).digest('hex');
    redis.get
      .mockResolvedValueOnce(JSON.stringify({ userId: 'user-1', familyId: 'family-1' }))
      .mockResolvedValueOnce('1');

    await expect(service.refresh(raw)).resolves.toMatchObject({ userId: 'user-1', accessToken: 'access-jwt' });
    expect(redis.del).toHaveBeenCalledWith(`rt:${hash}`);
    expect(redis.setEx).toHaveBeenCalledWith(`rtused:${hash}`, 'family-1', 2592000);
  });

  it('kills a token family when a spent refresh token is reused', async () => {
    const { service, redis } = makeService();
    redis.get.mockResolvedValueOnce(null).mockResolvedValueOnce('family-1');
    await expect(service.refresh('reused')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(redis.del).toHaveBeenCalledWith('rtfam:family-1');
  });

  it('rejects unknown and revoked-family refresh tokens', async () => {
    const unknown = makeService();
    await expect(unknown.service.refresh('unknown')).rejects.toBeInstanceOf(UnauthorizedException);

    const revoked = makeService();
    revoked.redis.get
      .mockResolvedValueOnce(JSON.stringify({ userId: 'user-1', familyId: 'family-1' }))
      .mockResolvedValueOnce(null);
    await expect(revoked.service.refresh('revoked')).rejects.toMatchObject({
      response: expect.objectContaining({ message: 'Refresh token family revoked' }),
    });
  });

  it('revokes families found through either live or spent tokens', async () => {
    const live = makeService();
    live.redis.get.mockResolvedValueOnce(JSON.stringify({ familyId: 'family-live' }));
    await live.service.revokeFamilyOf('live');
    expect(live.redis.del).toHaveBeenCalledWith('rtfam:family-live');

    const spent = makeService();
    spent.redis.get.mockResolvedValueOnce(null).mockResolvedValueOnce('family-spent');
    await spent.service.revokeFamilyOf('spent');
    expect(spent.redis.del).toHaveBeenCalledWith('rtfam:family-spent');
  });

  it('accepts only access JWTs with string subjects and absorbs verifier failures', async () => {
    const valid = makeService();
    await expect(valid.service.verifyAccess('jwt')).resolves.toBe('user-1');
    valid.jwt.verifyAsync.mockResolvedValue({ sub: 'user-1', typ: 'refresh' });
    await expect(valid.service.verifyAccess('jwt')).resolves.toBeNull();
    valid.jwt.verifyAsync.mockResolvedValue({ sub: 123, typ: 'access' });
    await expect(valid.service.verifyAccess('jwt')).resolves.toBeNull();
    valid.jwt.verifyAsync.mockRejectedValue(new Error('bad signature'));
    await expect(valid.service.verifyAccess('jwt')).resolves.toBeNull();
  });
});
