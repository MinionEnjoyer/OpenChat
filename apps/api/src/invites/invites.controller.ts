import { Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { UseGuards } from '@nestjs/common/decorators/core/use-guards.decorator';
import { SessionGuard } from '../auth/session.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { User } from '@prisma/client';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import * as z from 'zod';
import { InvitesService } from './invites.service';

const CreateInviteSchema = z.object({
  maxUses: z.number().int().positive().optional(),
  expiresInHours: z.number().positive().optional(),
});

export type CreateInviteDto = {
  maxUses?: number;
  expiresInHours?: number;
};

@Controller()
@UseGuards(SessionGuard)
export class InvitesController {
  constructor(private readonly invitesService: InvitesService) {}

  @Post('servers/:id/invites')
  async createInvite(
    @Param('id') serverId: string,
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(CreateInviteSchema)) body: CreateInviteDto,
  ) {
    return this.invitesService.createInvite(serverId, user.id, {
      maxUses: body.maxUses,
      expiresInHours: body.expiresInHours,
    });
  }

  @Get('invites/:code')
  async getInvite(@Param('code') code: string) {
    return this.invitesService.getInvite(code);
  }

  @Post('invites/:code/accept')
  async acceptInvite(
    @Param('code') code: string,
    @CurrentUser() user: User,
  ) {
    return this.invitesService.acceptInvite(code, user.id);
  }
}
