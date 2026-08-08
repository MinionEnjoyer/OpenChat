import { Body, Controller, Delete, Get, Param, Put, Query, Redirect, UseGuards } from '@nestjs/common';
import type { User } from '@prisma/client';
import { z } from 'zod';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { PatreonService } from './patreon.service';

const ConfigurePatreonGateSchema = z.object({
  campaignId: z.string().regex(/^\d+$/, 'campaignId must contain only digits'),
  minimumCents: z.number().int().min(0).max(100_000_000),
  enabled: z.boolean(),
});

export type ConfigurePatreonGateDto = {
  campaignId: string;
  minimumCents: number;
  enabled: boolean;
};

@Controller('servers/:serverId/patreon')
@UseGuards(AuthGuard)
export class PatreonGateController {
  constructor(private readonly patreon: PatreonService) {}

  @Get()
  get(@Param('serverId') serverId: string, @CurrentUser() user: User) {
    return this.patreon.getGate(serverId, user.id);
  }

  @Put()
  configure(
    @Param('serverId') serverId: string,
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(ConfigurePatreonGateSchema)) body: ConfigurePatreonGateDto,
  ) {
    return this.patreon.configureGate(serverId, user.id, body);
  }

  @Delete()
  remove(@Param('serverId') serverId: string, @CurrentUser() user: User) {
    return this.patreon.removeGate(serverId, user.id);
  }
}

@Controller('patreon')
export class PatreonController {
  constructor(private readonly patreon: PatreonService) {}

  @Get('join/:serverId')
  @Redirect(undefined, 302)
  async join(@Param('serverId') serverId: string) {
    return { url: await this.patreon.beginJoin(serverId), statusCode: 302 };
  }

  @Get('callback')
  @Redirect(undefined, 302)
  callback(@Query('code') code?: string, @Query('state') state?: string) {
    return this.patreon.completeJoinRedirect(code, state);
  }
}
