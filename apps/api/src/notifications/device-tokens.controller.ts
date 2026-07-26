import { Controller, Get, Post, Delete, Param, Body, UseGuards, HttpCode } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { DeviceTokensService, RegisterDeviceInput } from './device-tokens.service';
import type { User } from '@prisma/client';

/**
 * Device token registry — FR-NOTIF-001.
 *
 * POST   /api/devices          register / refresh a push token (idempotent)
 * GET    /api/devices          list the current user's devices only
 * DELETE /api/devices/:token   remove a token (idempotent — unknown token → 204)
 *
 * @satisfies FR-NOTIF-001
 */
@Controller()
@UseGuards(AuthGuard)
export class DeviceTokensController {
  constructor(private readonly deviceTokens: DeviceTokensService) {}

  @Post('devices')
  @HttpCode(201)
  register(@CurrentUser() user: User, @Body() body: RegisterDeviceInput) {
    return this.deviceTokens.register(user.id, body.token, body.platform);
  }

  @Get('devices')
  list(@CurrentUser() user: User) {
    return this.deviceTokens.listForUser(user.id);
  }

  @Delete('devices/:token')
  @HttpCode(204)
  async remove(@CurrentUser() user: User, @Param('token') token: string) {
    await this.deviceTokens.delete(user.id, token);
  }
}
