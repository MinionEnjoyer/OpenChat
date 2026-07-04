import { Controller, Get, Post, Param, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { VoiceService } from './voice.service';
import type { User } from '@prisma/client';

@Controller('voice')
@UseGuards(SessionGuard)
export class VoiceController {
  constructor(private readonly voice: VoiceService) {}

  @Post(':channelId/join')
  join(@Param('channelId') channelId: string, @CurrentUser() user: User) {
    return this.voice.join(channelId, user.id);
  }

  @Post(':channelId/leave')
  leave(@Param('channelId') channelId: string, @CurrentUser() user: User) {
    return this.voice.leave(channelId, user.id);
  }

  @Get(':channelId/participants')
  participants(@Param('channelId') channelId: string, @CurrentUser() user: User) {
    return this.voice.participants(channelId, user.id);
  }
}
