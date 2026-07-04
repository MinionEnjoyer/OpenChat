import { Injectable } from '@nestjs/common';
import { FriendsService } from '../friends/friends.service';
import { ServersService } from '../servers/servers.service';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly friends: FriendsService,
    private readonly servers: ServersService,
  ) {}

  /** Aggregate everything the user needs to act on: friend requests + server invitations. */
  async getForUser(userId: string) {
    const [pending, serverInvites] = await Promise.all([
      this.friends.listPending(userId),
      this.servers.listIncomingInvitations(userId),
    ]);
    const friendRequests = pending.incoming;
    return {
      friendRequests,
      serverInvites,
      count: friendRequests.length + serverInvites.length,
    };
  }
}
