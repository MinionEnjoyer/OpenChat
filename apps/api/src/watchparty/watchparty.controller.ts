import { Controller, Get, Post, Param, Query, Body, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { SessionGuard } from '../auth/session.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { WatchPartyService } from './watchparty.service';
import type { User } from '@prisma/client';

const StartDto = z.object({
  itemId: z.string().min(1).optional(),
  youtubeId: z.string().min(1).optional(),
  audio: z.boolean().optional(),
}).refine((d) => d.itemId || d.youtubeId, { message: 'itemId or youtubeId is required' });
const StateDto = z.object({ positionMs: z.number().nonnegative(), paused: z.boolean() });

@Controller('watchparty')
@UseGuards(SessionGuard)
export class WatchPartyController {
  constructor(private readonly wp: WatchPartyService) {}

  @Get('library')
  search(
    @Query(new ZodValidationPipe(z.object({
      q: z.string().max(200).default(''),
      type: z.enum(['all', 'movie', 'show', 'music']).default('all'),
    }))) query: { q: string; type: 'all' | 'movie' | 'show' | 'music' },
    @CurrentUser() _user: User,
  ) {
    return this.wp.search(query.q, query.type);
  }

  @Get('image/:itemId')
  image(@Param('itemId') itemId: string, @Res() res: Response) {
    return this.wp.proxyImage(itemId, res);
  }

  @Get('stream/:itemId')
  stream(@Param('itemId') itemId: string, @Req() req: Request, @Res() res: Response) {
    return this.wp.proxyStream(itemId, req, res);
  }

  @Get(':channelId')
  get(@Param('channelId') channelId: string, @CurrentUser() user: User) {
    return this.wp.get(channelId, user.id);
  }

  @Post(':channelId/start')
  start(
    @Param('channelId') channelId: string,
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(StartDto)) body: { itemId?: string; youtubeId?: string; audio?: boolean },
  ) {
    return this.wp.start(channelId, user.id, body);
  }

  @Post(':channelId/state')
  state(
    @Param('channelId') channelId: string,
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(StateDto)) body: { positionMs: number; paused: boolean },
  ) {
    return this.wp.updateState(channelId, user.id, body);
  }

  @Post(':channelId/stop')
  stop(@Param('channelId') channelId: string, @CurrentUser() user: User) {
    return this.wp.stop(channelId, user.id);
  }
}
