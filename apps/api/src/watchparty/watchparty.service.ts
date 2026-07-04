import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'stream';
import type { Request, Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

export interface LibraryItem {
  id: string;
  name: string;
  type: string;
  seriesName?: string;
  runtimeMs: number | null;
  imageUrl: string | null;
}

@Injectable()
export class WatchPartyService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  private jellyfin() {
    const url = this.config.get<string>('JELLYFIN_URL');
    const key = this.config.get<string>('JELLYFIN_API_KEY');
    if (!url || !key) throw new BadRequestException('Jellyfin is not configured');
    return { url: url.replace(/\/$/, ''), key };
  }

  private async assertAccess(channelId: string, userId: string) {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { id: true, serverId: true },
    });
    if (!channel) throw new NotFoundException('Channel not found');
    if (channel.serverId) {
      const m = await this.prisma.serverMember.findUnique({
        where: { serverId_userId: { serverId: channel.serverId, userId } },
      });
      if (!m) throw new ForbiddenException('Not a member of this server');
    } else {
      const r = await this.prisma.channelRecipient.findUnique({
        where: { channelId_userId: { channelId, userId } },
      });
      if (!r) throw new ForbiddenException('Not a participant of this DM');
    }
    return channel;
  }

  async search(query: string): Promise<LibraryItem[]> {
    const { url, key } = this.jellyfin();
    const params = new URLSearchParams({
      Recursive: 'true',
      IncludeItemTypes: 'Movie,Episode,Series',
      Limit: '40',
      Fields: 'RunTimeTicks',
      SortBy: 'SortName',
      ...(query ? { searchTerm: query } : {}),
    });
    const res = await fetch(`${url}/Items?${params.toString()}`, { headers: { 'X-Emby-Token': key } });
    if (!res.ok) throw new BadRequestException(`Jellyfin browse failed (${res.status})`);
    const data: any = await res.json();
    return (data.Items ?? []).map((i: any) => ({
      id: i.Id,
      name: i.Name,
      type: i.Type,
      seriesName: i.SeriesName,
      runtimeMs: i.RunTimeTicks ? Math.round(i.RunTimeTicks / 10000) : null,
      imageUrl: i.ImageTags?.Primary ? `/api/watchparty/image/${i.Id}` : null,
    }));
  }

  /** Proxy a poster image so the Jellyfin key stays server-side. */
  async proxyImage(itemId: string, res: Response) {
    const { url, key } = this.jellyfin();
    const upstream = await fetch(`${url}/Items/${itemId}/Images/Primary?maxWidth=300`, { headers: { 'X-Emby-Token': key } });
    if (!upstream.ok || !upstream.body) { res.status(404).end(); return; }
    res.status(200);
    const ct = upstream.headers.get('content-type');
    if (ct) res.setHeader('content-type', ct);
    res.setHeader('cache-control', 'public, max-age=86400');
    Readable.fromWeb(upstream.body as any).pipe(res);
  }

  /** Proxy the video stream (with Range support) so the key never reaches the client.
   *  Requests an mp4 (h264/aac) so browsers can play it — Jellyfin remuxes when the source is
   *  already compatible (cheap) and transcodes otherwise. Raw .mkv direct-play won't play in most browsers. */
  async proxyStream(itemId: string, req: Request, res: Response) {
    const { url, key } = this.jellyfin();
    const headers: Record<string, string> = { 'X-Emby-Token': key };
    if (req.headers.range) headers['Range'] = req.headers.range as string;
    const params = new URLSearchParams({ container: 'mp4', videoCodec: 'h264', audioCodec: 'aac', audioChannels: '2' });
    const upstream = await fetch(`${url}/Videos/${itemId}/stream.mp4?${params.toString()}`, { headers });
    res.status(upstream.status);
    for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
      const v = upstream.headers.get(h);
      if (v) res.setHeader(h, v);
    }
    if (!upstream.body) { res.end(); return; }
    Readable.fromWeb(upstream.body as any).pipe(res);
  }

  private async itemName(itemId: string): Promise<string> {
    const { url, key } = this.jellyfin();
    try {
      const res = await fetch(`${url}/Items/${itemId}`, { headers: { 'X-Emby-Token': key } });
      if (res.ok) { const d: any = await res.json(); return d.Name || 'video'; }
    } catch { /* ignore */ }
    return 'video';
  }

  private serialize(p: any, itemName?: string) {
    return {
      id: p.id,
      channelId: p.channelId,
      hostId: p.hostId,
      itemId: p.jellyfinItemId,
      itemName: itemName ?? p.itemName,
      positionMs: p.positionMs,
      paused: p.paused,
      streamUrl: `/api/watchparty/stream/${p.jellyfinItemId}`,
    };
  }

  private async publish(channelId: string, state: any | null) {
    await this.redis.publish('chat:events', { type: 'WATCHPARTY_SYNC', channelId, state });
  }

  async get(channelId: string, userId: string) {
    await this.assertAccess(channelId, userId);
    const party = await this.prisma.watchParty.findFirst({
      where: { channelId, endedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!party) return null;
    const state = this.serialize(party, await this.itemName(party.jellyfinItemId));
    return state;
  }

  async start(channelId: string, userId: string, itemId: string) {
    await this.assertAccess(channelId, userId);
    // End any existing active party in this channel.
    await this.prisma.watchParty.updateMany({ where: { channelId, endedAt: null }, data: { endedAt: new Date() } });
    const party = await this.prisma.watchParty.create({
      data: { channelId, hostId: userId, jellyfinItemId: itemId, positionMs: 0, paused: true },
    });
    const state = this.serialize(party, await this.itemName(itemId));
    await this.publish(channelId, state);
    return state;
  }

  async updateState(channelId: string, userId: string, data: { positionMs: number; paused: boolean }) {
    await this.assertAccess(channelId, userId);
    const party = await this.prisma.watchParty.findFirst({ where: { channelId, endedAt: null }, orderBy: { createdAt: 'desc' } });
    if (!party) throw new NotFoundException('No active watch party');
    if (party.hostId !== userId) throw new ForbiddenException('Only the host controls playback');
    const updated = await this.prisma.watchParty.update({
      where: { id: party.id },
      data: { positionMs: Math.max(0, Math.round(data.positionMs)), paused: !!data.paused },
    });
    const state = this.serialize(updated, await this.itemName(updated.jellyfinItemId));
    await this.publish(channelId, state);
    return state;
  }

  async stop(channelId: string, userId: string) {
    await this.assertAccess(channelId, userId);
    const party = await this.prisma.watchParty.findFirst({ where: { channelId, endedAt: null }, orderBy: { createdAt: 'desc' } });
    if (!party) return { success: true };
    if (party.hostId !== userId) throw new ForbiddenException('Only the host can stop the watch party');
    await this.prisma.watchParty.update({ where: { id: party.id }, data: { endedAt: new Date() } });
    await this.publish(channelId, null);
    return { success: true };
  }
}
