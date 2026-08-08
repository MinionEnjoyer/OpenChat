import {
  BadRequestException, Injectable, OnModuleDestroy, OnModuleInit, UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { MessageKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import {
  FederationEnvelope, FederationEnvelopeSchema, FederationEventType, FederationPeer,
  parseFederationPeers, signFederationEnvelope, signaturesMatch,
} from './federation.types';

const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

@Injectable()
export class FederationService implements OnModuleInit, OnModuleDestroy {
  private readonly enabled: boolean;
  private readonly nodeId: string;
  private readonly secret: string;
  private readonly peers: FederationPeer[];
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    config: ConfigService,
  ) {
    this.enabled = config.get<string>('FEDERATION_ENABLED') === '1';
    this.nodeId = config.get<string>('FEDERATION_NODE_ID') ?? '';
    this.secret = config.get<string>('FEDERATION_SHARED_SECRET') ?? '';
    this.peers = parseFederationPeers(config.get<string>('FEDERATION_PEERS'));
  }

  onModuleInit() {
    if (!this.enabled) return;
    this.timer = setInterval(() => void this.dispatchPending(), 5_000);
    this.timer.unref();
    void this.dispatchPending();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async status() {
    const store = this.prisma as any;
    const pending = this.enabled
      ? await store.federationDelivery.count({ where: { deliveredAt: null } })
      : 0;
    return { enabled: this.enabled, nodeId: this.enabled ? this.nodeId : null, peers: this.peers.length, pending };
  }

  async recordLocalEvent(
    eventType: typeof FederationEventType._type,
    aggregateId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    if (!this.enabled) return;
    const occurredAt = new Date();
    await (this.prisma as any).federationEvent.create({
      data: {
        id: randomUUID(), originNodeId: this.nodeId, eventType, aggregateId, payload, occurredAt, appliedAt: occurredAt,
        deliveries: { create: this.peers.map((peer) => ({ peerNodeId: peer.id })) },
      },
    });
    void this.dispatchPending();
  }

  async receive(
    body: unknown,
    headers: { nodeId?: string; timestamp?: string; signature?: string },
    now = Date.now(),
  ): Promise<{ accepted: true; duplicate: boolean }> {
    if (!this.enabled) throw new BadRequestException('Federation is disabled');
    const peer = this.peers.find((candidate) => candidate.id === headers.nodeId);
    if (!peer || !headers.timestamp || !headers.signature) throw new UnauthorizedException('Invalid federation credentials');
    const timestampMs = Number(headers.timestamp);
    if (!Number.isFinite(timestampMs) || Math.abs(now - timestampMs) > MAX_CLOCK_SKEW_MS) {
      throw new UnauthorizedException('Stale federation request');
    }
    const envelope = FederationEnvelopeSchema.parse(body);
    if (envelope.originNodeId !== peer.id) throw new UnauthorizedException('Origin mismatch');
    const expected = signFederationEnvelope(this.secret, headers.timestamp, envelope);
    if (!signaturesMatch(expected, headers.signature)) throw new UnauthorizedException('Invalid federation signature');

    const store = this.prisma as any;
    let event = await store.federationEvent.findUnique({ where: { id: envelope.id } });
    const duplicate = Boolean(event?.appliedAt);
    if (!event) {
      event = await store.federationEvent.create({
        data: {
          id: envelope.id,
          originNodeId: envelope.originNodeId,
          eventType: envelope.eventType,
          aggregateId: envelope.aggregateId,
          payload: envelope.payload,
          occurredAt: new Date(envelope.occurredAt),
        },
      });
    }
    if (!event.appliedAt) {
      try {
        await this.applyEnvelope(envelope);
        await store.federationEvent.update({ where: { id: envelope.id }, data: { appliedAt: new Date(), applyError: null } });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await store.federationEvent.update({ where: { id: envelope.id }, data: { applyError: message.slice(0, 1000) } });
        throw new BadRequestException(`Could not apply mirrored event: ${message}`);
      }
    }
    return { accepted: true, duplicate };
  }

  private async applyEnvelope(envelope: FederationEnvelope): Promise<void> {
    const message = envelope.payload as any;
    const store = this.prisma as any;
    if (envelope.eventType === 'MESSAGE_CREATED') {
      const existing = await store.message.findUnique({ where: { id: message.id } });
      if (!existing) {
        await store.message.create({
          data: {
            id: message.id,
            channelId: message.channelId,
            authorId: message.authorId,
            content: message.content,
            createdAt: new Date(message.createdAt),
            editedAt: message.editedAt ? new Date(message.editedAt) : null,
            deletedAt: message.deletedAt ? new Date(message.deletedAt) : null,
            replyToId: null,
            pinned: Boolean(message.pinned),
            kind: MessageKind.USER,
            attachments: {
              create: (message.attachments ?? []).map((attachment: any) => ({
                id: attachment.id,
                shareAssetId: attachment.shareAssetId,
                filename: attachment.filename,
                mimeType: attachment.mimeType,
                size: BigInt(attachment.size),
                url: attachment.url,
                thumbnailUrl: attachment.thumbnailUrl ?? null,
                width: attachment.width ?? null,
                height: attachment.height ?? null,
                durationMs: attachment.durationMs ?? null,
              })),
            },
          },
        });
      }
      await this.redis.publish('chat:events', { type: 'MESSAGE_CREATED', message });
      return;
    }
    if (envelope.eventType === 'MESSAGE_UPDATED') {
      await store.message.updateMany({
        where: { id: message.id },
        data: { content: message.content, editedAt: message.editedAt ? new Date(message.editedAt) : new Date() },
      });
      await this.redis.publish('chat:events', { type: 'MESSAGE_UPDATED', message });
      return;
    }
    await store.message.updateMany({ where: { id: message.id }, data: { deletedAt: new Date(message.deletedAt) } });
    await this.redis.publish('chat:events', { type: 'MESSAGE_DELETED', id: message.id, channelId: message.channelId });
  }

  async dispatchPending(): Promise<void> {
    if (!this.enabled) return;
    const store = this.prisma as any;
    const deliveries = await store.federationDelivery.findMany({
      where: { deliveredAt: null, nextAttemptAt: { lte: new Date() } },
      include: { event: true },
      orderBy: { nextAttemptAt: 'asc' },
      take: 25,
    });
    for (const delivery of deliveries) {
      const peer = this.peers.find((candidate) => candidate.id === delivery.peerNodeId);
      if (!peer) continue;
      const envelope = FederationEnvelopeSchema.parse({
        id: delivery.event.id,
        originNodeId: delivery.event.originNodeId,
        eventType: delivery.event.eventType,
        aggregateId: delivery.event.aggregateId,
        occurredAt: delivery.event.occurredAt.toISOString(),
        payload: delivery.event.payload,
      });
      const timestamp = String(Date.now());
      try {
        const response = await fetch(`${peer.url}/api/federation/v1/events`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-openchat-node': this.nodeId,
            'x-openchat-timestamp': timestamp,
            'x-openchat-signature': signFederationEnvelope(this.secret, timestamp, envelope),
          },
          body: JSON.stringify(envelope),
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) throw new Error(`peer returned HTTP ${response.status}`);
        await store.federationDelivery.update({ where: { id: delivery.id }, data: { deliveredAt: new Date(), lastError: null } });
      } catch (error) {
        const attempts = delivery.attempts + 1;
        const delaySeconds = Math.min(300, 2 ** Math.min(attempts, 8));
        await store.federationDelivery.update({
          where: { id: delivery.id },
          data: {
            attempts,
            nextAttemptAt: new Date(Date.now() + delaySeconds * 1000),
            lastError: (error instanceof Error ? error.message : String(error)).slice(0, 1000),
          },
        });
      }
    }
  }
}
