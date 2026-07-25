import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards, NotFoundException } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { NotificationsService, UpsertNotificationSettingInput } from './notifications.service';
import { ServersService } from '../servers/servers.service';
import type { User } from '@prisma/client';

/**
 * @satisfies FR-NOTIF-003
 */
@Controller()
@UseGuards(AuthGuard)
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

  /** List all notification settings for the authenticated user. */
  @Get('notifications/settings')
  getSettings(@CurrentUser() user: User) {
    return this.notifications.getSettings(user.id);
  }

  /** Upsert a notification setting. */
  @Put('notifications/settings')
  upsertSetting(@CurrentUser() user: User, @Body() input: UpsertNotificationSettingInput) {
    return this.notifications.upsertSetting(user.id, input);
  }

  /** Delete a notification setting by ID. */
  @Delete('notifications/settings/:id')
  async deleteSetting(@CurrentUser() user: User, @Param('id') id: string) {
    const result = await this.notifications.deleteSetting(user.id, id);
    if (!result) throw new NotFoundException('Notification setting not found');
    return result;
  }
}
