import { Controller, Get, Post, Patch, Put, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { ServersService } from './servers.service';
import { SessionGuard } from '../auth/session.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { PERMISSION_LIST } from '../permissions/permissions';
import type { User } from '@prisma/client';

const CreateServerDto = z.object({ name: z.string().min(1).max(100) });
const UpdateServerDto = z.object({
  name: z.string().min(1).max(100).optional(),
  iconUrl: z.string().max(1000).optional(),
});
const CreateChannelDto = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['TEXT', 'VOICE', 'ANNOUNCEMENT']).default('TEXT'),
  categoryId: z.string().uuid().optional(),
});
const CreateRoleDto = z.object({
  name: z.string().min(1).max(60),
  color: z.number().int().optional(),
  permissions: z.string().regex(/^\d+$/).optional(),
});
const UpdateRoleDto = z.object({
  name: z.string().min(1).max(60).optional(),
  color: z.number().int().optional(),
  permissions: z.string().regex(/^\d+$/).optional(),
});

@Controller('servers')
@UseGuards(SessionGuard)
export class ServersController {
  constructor(private readonly servers: ServersService) {}

  /** Static catalog of permissions for building the admin UI. */
  @Get('permissions')
  permissionCatalog() {
    return PERMISSION_LIST;
  }

  @Get()
  list(@CurrentUser() user: User) {
    return this.servers.listForUser(user.id);
  }

  @Post()
  create(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(CreateServerDto)) body: { name: string },
  ) {
    return this.servers.create(user.id, body);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: User) {
    return this.servers.get(id, user.id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(UpdateServerDto)) body: { name?: string; iconUrl?: string },
  ) {
    return this.servers.updateServer(id, user.id, body);
  }

  @Delete(':id')
  deleteServer(@Param('id') id: string, @CurrentUser() user: User) {
    return this.servers.deleteServer(id, user.id);
  }

  @Get(':id/sounds')
  listSounds(@Param('id') serverId: string, @CurrentUser() user: User) {
    return this.servers.listSounds(serverId, user.id);
  }

  @Post(':id/sounds')
  addSound(
    @Param('id') serverId: string,
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(z.object({
      name: z.string().min(1).max(40),
      url: z.string().url(),
      emoji: z.string().max(8).nullable().optional(),
    }))) body: { name: string; url: string; emoji?: string | null },
  ) {
    return this.servers.addSound(serverId, user.id, body);
  }

  @Delete(':id/sounds/:soundId')
  deleteSound(
    @Param('id') serverId: string,
    @Param('soundId') soundId: string,
    @CurrentUser() user: User,
  ) {
    return this.servers.deleteSound(serverId, soundId, user.id);
  }

  @Get(':id/channels')
  listChannels(@Param('id') serverId: string, @CurrentUser() user: User) {
    return this.servers.listChannels(serverId, user.id);
  }

  @Post(':id/channels')
  createChannel(
    @Param('id') serverId: string,
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(CreateChannelDto))
    body: { name: string; type: 'TEXT' | 'VOICE' | 'ANNOUNCEMENT'; categoryId?: string },
  ) {
    return this.servers.createChannel(serverId, user.id, body);
  }

  @Patch(':id/channels/reorder')
  reorderChannels(
    @Param('id') serverId: string,
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(z.object({ orderedIds: z.array(z.string()) }))) body: { orderedIds: string[] },
  ) {
    return this.servers.reorderChannels(serverId, user.id, body.orderedIds);
  }

  @Delete(':id/channels/:channelId')
  deleteChannel(
    @Param('id') serverId: string,
    @Param('channelId') channelId: string,
    @CurrentUser() user: User,
  ) {
    return this.servers.deleteChannel(serverId, channelId, user.id);
  }

  @Get(':id/members')
  listMembers(@Param('id') serverId: string, @CurrentUser() user: User) {
    return this.servers.listMembers(serverId, user.id);
  }

  @Post(':id/members')
  inviteMember(
    @Param('id') serverId: string,
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(z.object({ userId: z.string().uuid() }))) body: { userId: string },
  ) {
    return this.servers.inviteMember(serverId, user.id, body.userId);
  }

  @Delete(':id/members/me')
  leave(@Param('id') serverId: string, @CurrentUser() user: User) {
    return this.servers.leave(serverId, user.id);
  }

  @Delete(':id/members/:userId')
  kick(
    @Param('id') serverId: string,
    @Param('userId') targetUserId: string,
    @CurrentUser() user: User,
  ) {
    return this.servers.kickMember(serverId, targetUserId, user.id);
  }

  // ---- Roles ----

  @Get(':id/roles')
  listRoles(@Param('id') serverId: string, @CurrentUser() user: User) {
    return this.servers.listRoles(serverId, user.id);
  }

  @Post(':id/roles')
  createRole(
    @Param('id') serverId: string,
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(CreateRoleDto))
    body: { name: string; color?: number; permissions?: string },
  ) {
    return this.servers.createRole(serverId, user.id, body);
  }

  @Patch(':id/roles/:roleId')
  updateRole(
    @Param('id') serverId: string,
    @Param('roleId') roleId: string,
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(UpdateRoleDto))
    body: { name?: string; color?: number; permissions?: string },
  ) {
    return this.servers.updateRole(serverId, roleId, user.id, body);
  }

  @Delete(':id/roles/:roleId')
  deleteRole(
    @Param('id') serverId: string,
    @Param('roleId') roleId: string,
    @CurrentUser() user: User,
  ) {
    return this.servers.deleteRole(serverId, roleId, user.id);
  }

  @Put(':id/members/:userId/roles/:roleId')
  assignRole(
    @Param('id') serverId: string,
    @Param('userId') targetUserId: string,
    @Param('roleId') roleId: string,
    @CurrentUser() user: User,
  ) {
    return this.servers.setMemberRole(serverId, targetUserId, roleId, user.id, true);
  }

  @Delete(':id/members/:userId/roles/:roleId')
  unassignRole(
    @Param('id') serverId: string,
    @Param('userId') targetUserId: string,
    @Param('roleId') roleId: string,
    @CurrentUser() user: User,
  ) {
    return this.servers.setMemberRole(serverId, targetUserId, roleId, user.id, false);
  }
}
