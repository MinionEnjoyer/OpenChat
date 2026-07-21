import { Controller, Get, Post, Param, Query, Body, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { SessionGuard } from '../auth/session.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { WatchPartyService } from './watchparty.service';
import type { User } from '@prisma/client';

const StartDto = z.object({ itemId: z.string().min(1) });
const StateDto = z.object({ positionMs: z.number().nonnegative(), paused: z.boolean() });

@Controller('watchparty')
@UseGuards(SessionGuard)
export class WatchPartyController {
  constructor(private readonly wp: WatchPartyService) {}

  @Get('library')
  search(
    @Query(new ZodValidationPipe(z.object({ q: z.string().max(200).default('') }))) query: { q: string },
    @CurrentUser() _user: User,
  ) {
    return this.wp.search(query.q);
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
    @Body(new ZodValidationPipe(StartDto)) body: { itemId: string },
  ) {
    return this.wp.start(channelId, user.id, body.itemId);
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
