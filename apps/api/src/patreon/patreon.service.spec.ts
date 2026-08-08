import type { ConfigService } from '@nestjs/config';
import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { PatreonService } from './patreon.service';

function config(enabled = true): ConfigService {
  const values: Record<string, string> = {
    PATREON_ENABLED: enabled ? '1' : '0',
    PATREON_CLIENT_ID: 'client-id',
    PATREON_CLIENT_SECRET: 'client-secret',
    PATREON_REDIRECT_URI: 'https://chat.example.com/api/patreon/callback',
    WEB_ORIGIN: 'https://chat.example.com',
  };
  return { get: jest.fn((key: string) => values[key]) } as unknown as ConfigService;
}

function eligibleMembership(amount = 500) {
  return {
    type: 'member',
    attributes: { patron_status: 'active_patron', currently_entitled_amount_cents: amount },
    relationships: { campaign: { data: { id: '12345' } } },
  };
}

describe('PatreonService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('stores a short-lived OAuth state and creates the Patreon authorization URL', async () => {
    const patreonGate = { findUnique: jest.fn().mockResolvedValue({ enabled: true }) };
    const redis = { setEx: jest.fn().mockResolvedValue('OK') };
    const service = new PatreonService(config(), { patreonGate } as any, redis as any);

    const url = new URL(await service.beginJoin('server-1'));

    expect(url.origin + url.pathname).toBe('https://www.patreon.com/oauth2/authorize');
    expect(url.searchParams.get('client_id')).toBe('client-id');
    expect(url.searchParams.get('scope')).toBe('identity identity.memberships');
    expect(url.searchParams.get('state')).toHaveLength(43);
    expect(redis.setEx).toHaveBeenCalledWith(
      expect.stringMatching(/^patreon:oauth:/),
      JSON.stringify({ serverId: 'server-1' }),
      600,
    );
  });

  it('verifies current membership and creates a one-use, expiring invite', async () => {
    const invite = { create: jest.fn().mockResolvedValue({}) };
    const patreonGate = {
      findUnique: jest.fn().mockResolvedValue({
        serverId: 'server-1', campaignId: '12345', minimumCents: 500, enabled: true,
        server: { ownerId: 'owner-1' },
      }),
    };
    const redis = {
      get: jest.fn().mockResolvedValue(JSON.stringify({ serverId: 'server-1' })),
      del: jest.fn().mockResolvedValue(1),
    };
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'ephemeral-token' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ included: [eligibleMembership()] }) }) as any;
    const service = new PatreonService(config(), { patreonGate, invite } as any, redis as any);

    const code = await service.completeJoin('oauth-code', 'state-value');

    expect(code).toHaveLength(16);
    expect(redis.del).toHaveBeenCalledWith('patreon:oauth:state-value');
    expect(invite.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        code,
        serverId: 'server-1',
        inviterId: 'owner-1',
        maxUses: 1,
        expiresAt: expect.any(Date),
      }),
    });
    const tokenRequest = (global.fetch as jest.Mock).mock.calls[0];
    expect(String(tokenRequest[1].body)).toContain('client_secret=client-secret');
    const membershipRequest = (global.fetch as jest.Mock).mock.calls[1];
    expect(membershipRequest[1].headers).toEqual({ Authorization: 'Bearer ephemeral-token' });
  });

  it('rejects an inactive or under-threshold patron without creating an invite', async () => {
    const invite = { create: jest.fn() };
    const patreonGate = {
      findUnique: jest.fn().mockResolvedValue({
        serverId: 'server-1', campaignId: '12345', minimumCents: 500, enabled: true,
        server: { ownerId: 'owner-1' },
      }),
    };
    const redis = {
      get: jest.fn().mockResolvedValue(JSON.stringify({ serverId: 'server-1' })),
      del: jest.fn().mockResolvedValue(1),
    };
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'ephemeral-token' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ included: [eligibleMembership(499)] }) }) as any;
    const service = new PatreonService(config(), { patreonGate, invite } as any, redis as any);

    await expect(service.completeJoin('oauth-code', 'state-value')).rejects.toBeInstanceOf(ForbiddenException);
    expect(invite.create).not.toHaveBeenCalled();
  });

  it('is unavailable when the host has not configured Patreon OAuth', async () => {
    const service = new PatreonService(config(false), {} as any, {} as any);
    await expect(service.beginJoin('server-1')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
