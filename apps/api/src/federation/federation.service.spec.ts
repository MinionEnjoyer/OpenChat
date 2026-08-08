import type { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { FederationService } from './federation.service';
import { signFederationEnvelope } from './federation.types';
import type { FederationEnvelope } from './federation.types';

function enabledConfig(): ConfigService {
  const values: Record<string, string> = {
    FEDERATION_ENABLED: '1',
    FEDERATION_NODE_ID: 'west',
    FEDERATION_SHARED_SECRET: 'a'.repeat(32),
    FEDERATION_PEERS: JSON.stringify([{ id: 'east', url: 'https://east.example.com/' }]),
  };
  return { get: jest.fn((key: string) => values[key]) } as unknown as ConfigService;
}

function envelope(): FederationEnvelope {
  return {
    id: '6c02a6be-c63f-447a-8eca-4793690937bd',
    originNodeId: 'east',
    eventType: 'MESSAGE_CREATED',
    aggregateId: 'message-1',
    occurredAt: '2026-08-08T07:00:00.000Z',
    payload: {
      id: 'message-1', channelId: 'channel-1', authorId: 'user-1', content: 'Mirrored',
      createdAt: '2026-08-08T07:00:00.000Z', editedAt: null, deletedAt: null,
      pinned: false, attachments: [],
    },
  };
}

describe('FederationService', () => {
  it('authenticates, persists, applies, and publishes an incoming event', async () => {
    const federationEvent = {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }) => ({ ...data, appliedAt: null })),
      update: jest.fn().mockResolvedValue({}),
    };
    const message = { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({}) };
    const redis = { publish: jest.fn().mockResolvedValue(undefined) };
    const service = new FederationService({ federationEvent, message } as any, redis as any, enabledConfig());
    const body = envelope();
    const now = Date.parse('2026-08-08T07:00:10.000Z');
    const timestamp = String(now);

    await expect(service.receive(body, {
      nodeId: 'east', timestamp,
      signature: signFederationEnvelope('a'.repeat(32), timestamp, body),
    }, now)).resolves.toEqual({ accepted: true, duplicate: false });

    expect(federationEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ id: body.id, originNodeId: 'east' }),
    }));
    expect(message.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ id: 'message-1', content: 'Mirrored' }),
    }));
    expect(redis.publish).toHaveBeenCalledWith('chat:events', { type: 'MESSAGE_CREATED', message: body.payload });
    expect(federationEvent.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ applyError: null }),
    }));
  });

  it('rejects stale requests before touching persistence', async () => {
    const federationEvent = { findUnique: jest.fn() };
    const service = new FederationService({ federationEvent } as any, {} as any, enabledConfig());
    const body = envelope();
    const timestamp = String(Date.parse('2026-08-08T06:00:00.000Z'));

    await expect(service.receive(body, {
      nodeId: 'east', timestamp,
      signature: signFederationEnvelope('a'.repeat(32), timestamp, body),
    }, Date.parse('2026-08-08T07:00:00.000Z'))).rejects.toBeInstanceOf(UnauthorizedException);
    expect(federationEvent.findUnique).not.toHaveBeenCalled();
  });

  it('creates one durable delivery per configured peer', async () => {
    const federationEvent = { create: jest.fn().mockResolvedValue({}) };
    const federationDelivery = { findMany: jest.fn().mockResolvedValue([]) };
    const service = new FederationService({ federationEvent, federationDelivery } as any, {} as any, enabledConfig());

    await service.recordLocalEvent('MESSAGE_DELETED', 'message-1', {
      id: 'message-1', channelId: 'channel-1', deletedAt: '2026-08-08T07:00:00.000Z',
    });

    expect(federationEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        originNodeId: 'west',
        deliveries: { create: [{ peerNodeId: 'east' }] },
      }),
    }));
  });
});
