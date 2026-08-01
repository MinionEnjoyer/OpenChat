import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { MessagesService } from './messages.service';
import { CreateMessageSchema, EditMessageSchema, MessageAttachmentSchema } from './message.schemas';
import type { User } from '@prisma/client';

const GetMessagesQuery = z.object({
  before: z.string().uuid().optional(),
  after: z.string().uuid().optional(),
  around: z.string().uuid().optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
}).refine((query) => [query.before, query.after, query.around].filter(Boolean).length <= 1, {
  message: 'before, after, and around are mutually exclusive',
});

const SearchMessagesQuery = z.object({
  q: z.string().min(1).max(200),
  limit: z.coerce.number().int().positive().max(100).default(50),
});

const ReadDto = z.object({ lastReadMessageId: z.string().uuid() });

@Controller()
@UseGuards(AuthGuard)
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get('channels/:id/messages')
  list(
    @Param('id') channelId: string,
    @CurrentUser() user: User,
    @Query(new ZodValidationPipe(GetMessagesQuery)) query: { before?: string; after?: string; around?: string; limit?: number },
  ) {
    return this.messages.list(channelId, user.id, query);
  }

  @Get('channels/:id/messages/search')
  search(
    @Param('id') channelId: string,
    @CurrentUser() user: User,
    @Query(new ZodValidationPipe(SearchMessagesQuery)) query: { q: string; limit?: number },
  ) {
    return this.messages.search(channelId, user.id, query.q, { limit: query.limit });
  }

  @Post('channels/:id/messages')
  create(
    @Param('id') channelId: string,
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(CreateMessageSchema))
    body: { content: string; attachments?: z.input<typeof MessageAttachmentSchema>[]; nonce?: string; replyToId?: string | null },
  ) {
    return this.messages.create(channelId, user.id, body);
  }

  @Patch('messages/:id')
  edit(
    @Param('id') messageId: string,
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(EditMessageSchema)) body: { content: string },
  ) {
    return this.messages.edit(messageId, user.id, body);
  }

  @Delete('messages/:id')
  remove(@Param('id') messageId: string, @CurrentUser() user: User) {
    return this.messages.remove(messageId, user.id);
  }

  @Post('messages/:id/reactions')
  addReaction(
    @Param('id') messageId: string,
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(z.object({ emoji: z.string().min(1).max(16) }))) body: { emoji: string },
  ) {
    return this.messages.addReaction(messageId, user.id, body.emoji);
  }

  @Delete('messages/:id/reactions/:emoji')
  removeReaction(
    @Param('id') messageId: string,
    @Param('emoji') emoji: string,
    @CurrentUser() user: User,
  ) {
    return this.messages.removeReaction(messageId, user.id, decodeURIComponent(emoji));
  }

  @Get('channels/:id/pins')
  listPins(@Param('id') channelId: string, @CurrentUser() user: User) {
    return this.messages.listPinned(channelId, user.id);
  }

  @Patch('messages/:id/pin')
  setPin(
    @Param('id') messageId: string,
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(z.object({ pinned: z.boolean() }))) body: { pinned: boolean },
  ) {
    return this.messages.setPinned(messageId, user.id, body.pinned);
  }

  @Post('channels/:id/polls')
  createPoll(
    @Param('id') channelId: string,
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(z.object({
      question: z.string().min(1).max(300),
      options: z.array(z.string().min(1).max(100)).min(2).max(10),
      multiple: z.boolean().optional(),
      durationMinutes: z.number().int().positive().max(10080).nullable().optional(),
    }))) body: { question: string; options: string[]; multiple?: boolean; durationMinutes?: number | null },
  ) {
    return this.messages.createPoll(channelId, user.id, body);
  }

  @Post('polls/options/:optionId/vote')
  votePoll(@Param('optionId') optionId: string, @CurrentUser() user: User) {
    return this.messages.votePollOption(optionId, user.id);
  }

  @Post('channels/:id/read')
  markRead(
    @Param('id') channelId: string,
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(ReadDto)) body: { lastReadMessageId: string },
  ) {
    return this.messages.markRead(channelId, user.id, body.lastReadMessageId);
  }

  @Get('channels/:id/read')
  getReadState(@Param('id') channelId: string, @CurrentUser() user: User) {
    return this.messages.getReadState(channelId, user.id);
  }
}
