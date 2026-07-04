import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { DmsService } from './dms.service';
import { SessionGuard } from '../auth/session.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { User } from '@prisma/client';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { z } from 'zod';

const OpenDmSchema = z.object({
  userId: z.string().uuid(),
});

@Controller('dms')
@UseGuards(SessionGuard)
export class DmsController {
  constructor(private readonly dmsService: DmsService) {}

  @Get()
  listDms(@CurrentUser() user: User) {
    return this.dmsService.listDms(user.id);
  }

  @Post()
  openDm(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(OpenDmSchema)) body: { userId: string },
  ) {
    return this.dmsService.openDm(user.id, body.userId);
  }
}
