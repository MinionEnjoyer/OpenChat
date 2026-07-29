import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { BotsService } from './bots.service';

type Caller = { id: string };

/**
 * Bot developer API: create/manage your bots + browse published bots.
 *   POST   /bots               create a bot (returns token once)
 *   GET    /bots               your bots
 *   GET    /bots/directory     published bots (add-bot browser)
 *   PATCH  /bots/:id           edit description / publish / avatar / name
 *   POST   /bots/:id/token     regenerate the bot's token
 *   DELETE /bots/:id           delete the bot
 */
@Controller('bots')
@UseGuards(AuthGuard)
export class BotsController {
  constructor(private readonly bots: BotsService) {}

  @Post()
  create(@CurrentUser() user: Caller, @Body() body: { username?: string; displayName?: string; description?: string }) {
    return this.bots.createBot(user.id, body || {});
  }

  @Get()
  mine(@CurrentUser() user: Caller) {
    return this.bots.listMine(user.id);
  }

  @Get('directory')
  directory() {
    return this.bots.listDirectory();
  }

  @Patch(':id')
  update(@CurrentUser() user: Caller, @Param('id') id: string, @Body() body: { displayName?: string; description?: string; published?: boolean; avatarUrl?: string }) {
    return this.bots.updateBot(user.id, id, body || {});
  }

  @Post(':id/token')
  resetToken(@CurrentUser() user: Caller, @Param('id') id: string) {
    return this.bots.resetToken(user.id, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: Caller, @Param('id') id: string) {
    return this.bots.deleteBot(user.id, id);
  }
}

/**
 * Add/remove a bot on a server (caller needs Manage Server on that server).
 *   POST   /servers/:serverId/bots/:botId
 *   DELETE /servers/:serverId/bots/:botId
 */
@Controller('servers/:serverId/bots')
@UseGuards(AuthGuard)
export class ServerBotsController {
  constructor(private readonly bots: BotsService) {}

  @Post(':botId')
  add(@CurrentUser() user: Caller, @Param('serverId') serverId: string, @Param('botId') botId: string) {
    return this.bots.addToServer(user.id, serverId, botId);
  }

  @Delete(':botId')
  remove(@CurrentUser() user: Caller, @Param('serverId') serverId: string, @Param('botId') botId: string) {
    return this.bots.removeFromServer(user.id, serverId, botId);
  }
}
