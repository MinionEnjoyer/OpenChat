import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import type { ConfigurePatreonGateDto } from './patreon.controller';

const OAUTH_STATE_TTL_SECONDS = 10 * 60;
const INVITE_TTL_MS = 60 * 60 * 1000;

type PatreonMember = {
  type?: string;
  attributes?: {
    patron_status?: string | null;
    currently_entitled_amount_cents?: number | null;
  };
  relationships?: {
    campaign?: { data?: { id?: string } | null };
  };
};

@Injectable()
export class PatreonService {
  private readonly enabled: boolean;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly webOrigin: string;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {
    this.enabled = config.get<string>('PATREON_ENABLED') === '1';
    this.clientId = config.get<string>('PATREON_CLIENT_ID') ?? '';
    this.clientSecret = config.get<string>('PATREON_CLIENT_SECRET') ?? '';
    this.redirectUri = config.get<string>('PATREON_REDIRECT_URI') ?? '';
    this.webOrigin = (config.get<string>('WEB_ORIGIN') ?? '').split(',')[0].trim().replace(/\/$/, '');
  }

  async getGate(serverId: string, userId: string) {
    await this.assertOwner(serverId, userId);
    const gate = await this.prisma.patreonGate.findUnique({ where: { serverId } });
    return this.serializeGate(serverId, gate);
  }

  async configureGate(serverId: string, userId: string, input: ConfigurePatreonGateDto) {
    await this.assertOwner(serverId, userId);
    const gate = await this.prisma.patreonGate.upsert({
      where: { serverId },
      create: { serverId, ...input },
      update: input,
    });
    return this.serializeGate(serverId, gate);
  }

  async removeGate(serverId: string, userId: string) {
    await this.assertOwner(serverId, userId);
    await this.prisma.patreonGate.deleteMany({ where: { serverId } });
    return { success: true };
  }

  async beginJoin(serverId: string): Promise<string> {
    this.assertAvailable();
    const gate = await this.prisma.patreonGate.findUnique({ where: { serverId } });
    if (!gate?.enabled) throw new NotFoundException('Patreon invitations are not enabled for this server');

    const state = randomBytes(32).toString('base64url');
    await this.redis.setEx(`patreon:oauth:${state}`, JSON.stringify({ serverId }), OAUTH_STATE_TTL_SECONDS);
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: 'identity identity.memberships',
      state,
    });
    return `https://www.patreon.com/oauth2/authorize?${params.toString()}`;
  }

  async completeJoinRedirect(code?: string, state?: string) {
    try {
      const inviteCode = await this.completeJoin(code, state);
      return { url: `${this.webOrigin}/?patreonInvite=${encodeURIComponent(inviteCode)}`, statusCode: 302 };
    } catch (error) {
      const message = error instanceof ForbiddenException
        ? 'Your Patreon membership does not meet this server requirement.'
        : 'Patreon verification could not be completed. Please try again.';
      return { url: `${this.webOrigin}/?patreonError=${encodeURIComponent(message)}`, statusCode: 302 };
    }
  }

  async completeJoin(code?: string, state?: string): Promise<string> {
    this.assertAvailable();
    if (!code || !state) throw new BadRequestException('Missing Patreon OAuth callback parameters');
    const stateKey = `patreon:oauth:${state}`;
    const stored = await this.redis.get(stateKey);
    if (!stored) throw new BadRequestException('Patreon OAuth state is invalid or expired');
    await this.redis.del(stateKey);

    let serverId: string;
    try {
      serverId = (JSON.parse(stored) as { serverId?: string }).serverId ?? '';
    } catch {
      throw new BadRequestException('Patreon OAuth state is invalid');
    }
    if (!serverId) throw new BadRequestException('Patreon OAuth state is invalid');

    const gate = await this.prisma.patreonGate.findUnique({ where: { serverId }, include: { server: true } });
    if (!gate?.enabled) throw new NotFoundException('Patreon invitations are no longer enabled for this server');

    const accessToken = await this.exchangeCode(code);
    const members = await this.fetchMemberships(accessToken);
    const eligible = members.some((member) => {
      const campaignId = member.relationships?.campaign?.data?.id;
      const amount = member.attributes?.currently_entitled_amount_cents ?? 0;
      return member.type === 'member'
        && campaignId === gate.campaignId
        && member.attributes?.patron_status === 'active_patron'
        && amount >= gate.minimumCents;
    });
    if (!eligible) throw new ForbiddenException('Active Patreon membership is required');

    const inviteCode = randomBytes(12).toString('base64url');
    await this.prisma.invite.create({
      data: {
        code: inviteCode,
        serverId,
        inviterId: gate.server.ownerId,
        maxUses: 1,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      },
    });
    return inviteCode;
  }

  private async exchangeCode(code: string): Promise<string> {
    const response = await fetch('https://www.patreon.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: this.redirectUri,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new BadRequestException('Patreon authorization failed');
    const body = await response.json() as { access_token?: string };
    if (!body.access_token) throw new BadRequestException('Patreon did not return an access token');
    return body.access_token;
  }

  private async fetchMemberships(accessToken: string): Promise<PatreonMember[]> {
    const url = new URL('https://www.patreon.com/api/oauth2/v2/identity');
    url.searchParams.set('include', 'memberships.campaign');
    url.searchParams.set('fields[member]', 'patron_status,currently_entitled_amount_cents');
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new BadRequestException('Patreon membership lookup failed');
    const body = await response.json() as { included?: PatreonMember[] };
    return Array.isArray(body.included) ? body.included : [];
  }

  private assertAvailable() {
    if (!this.enabled) throw new ServiceUnavailableException('Patreon invitations are not configured on this host');
  }

  private async assertOwner(serverId: string, userId: string) {
    const server = await this.prisma.server.findUnique({ where: { id: serverId }, select: { ownerId: true } });
    if (!server) throw new NotFoundException('Server not found');
    if (server.ownerId !== userId) throw new ForbiddenException('Only the server owner can manage Patreon invitations');
  }

  private serializeGate(serverId: string, gate: { campaignId: string; minimumCents: number; enabled: boolean } | null) {
    return {
      available: this.enabled,
      gate,
      joinUrl: this.enabled && gate?.enabled ? `${this.webOrigin}/api/patreon/join/${serverId}` : null,
    };
  }
}
