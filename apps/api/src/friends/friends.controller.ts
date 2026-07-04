import { Controller, Get, Post, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { FriendsService } from './friends.service';
import { SessionGuard } from '../auth/session.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { User } from '@prisma/client';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { z } from 'zod';

const SendFriendRequestSchema = z
  .object({
    username: z.string().min(1).optional(),
    friendCode: z.string().regex(/^\d{8}$/, 'Friend code must be 8 digits').optional(),
  })
  .refine((v) => !!v.username || !!v.friendCode, {
    message: 'Provide a username or a friend code',
  });

@Controller('friends')
@UseGuards(SessionGuard)
export class FriendsController {
  constructor(private readonly friendsService: FriendsService) {}

  @Get()
  listFriends(@CurrentUser() user: User) {
    return this.friendsService.listFriends(user.id);
  }

  @Get('requests')
  listPending(@CurrentUser() user: User) {
    return this.friendsService.listPending(user.id);
  }

  @Post('requests')
  sendRequest(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(SendFriendRequestSchema))
    body: { username?: string; friendCode?: string },
  ) {
    return this.friendsService.sendRequest(user.id, body);
  }

  @Post('requests/:id/accept')
  accept(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    return this.friendsService.accept(id, user.id);
  }

  @Post('requests/:id/decline')
  decline(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    return this.friendsService.decline(id, user.id);
  }

  @Delete(':userId')
  remove(
    @CurrentUser() user: User,
    @Param('userId') userId: string,
  ) {
    return this.friendsService.remove(user.id, userId);
  }

  @Post('block/:userId')
  block(
    @CurrentUser() user: User,
    @Param('userId') userId: string,
  ) {
    return this.friendsService.block(user.id, userId);
  }
}
