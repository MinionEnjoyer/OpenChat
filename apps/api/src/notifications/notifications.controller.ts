import { Controller, Get, Post, Param, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { NotificationsService } from './notifications.service';
import { ServersService } from '../servers/servers.service';
import type { User } from '@prisma/client';

@Controller()
@UseGuards(SessionGuard)
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly servers: ServersService,
  ) {}

  @Get('notifications')
  get(@CurrentUser() user: User) {
    return this.notifications.getForUser(user.id);
  }

  @Post('server-invitations/:id/accept')
  accept(@Param('id') id: string, @CurrentUser() user: User) {
    return this.servers.acceptInvitation(id, user.id);
  }

  @Post('server-invitations/:id/decline')
  decline(@Param('id') id: string, @CurrentUser() user: User) {
    return this.servers.declineInvitation(id, user.id);
  }
}
