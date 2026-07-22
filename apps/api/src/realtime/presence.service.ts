import { Injectable } from '@nestjs/common';

const ACTIVE = ['ONLINE', 'AWAY', 'DND'];

/**
 * In-memory registry of currently-connected users and their live status — the
 * single source of truth for "who is online right now". The gateway maintains it
 * from socket connect/disconnect + presence.update; it is read by @here targeting
 * and the connect-time snapshot. `User.status` in the DB remains the user's manual
 * preference; this reflects actual connectivity.
 *
 * In-memory (single API instance). A multi-instance deploy would back this with a
 * Redis presence set keyed by userId with a heartbeat TTL.
 */
@Injectable()
export class PresenceService {
  // userId -> real status of a connected user (ONLINE | AWAY | DND | INVISIBLE | OFFLINE)
  private readonly statuses = new Map<string, string>();

  /** Mark a user present with the given real status. */
  set(userId: string, status: string): void {
    this.statuses.set(userId, status);
  }

  /** Mark a user fully offline (their last socket closed). */
  clear(userId: string): void {
    this.statuses.delete(userId);
  }

  /** Real status of a connected user, or OFFLINE if not connected. */
  get(userId: string): string {
    return this.statuses.get(userId) ?? 'OFFLINE';
  }

  /** True if the user is connected and visibly active — used for @here targeting. */
  isActive(userId: string): boolean {
    return ACTIVE.includes(this.statuses.get(userId) ?? 'OFFLINE');
  }

  /**
   * Presence as visible to other users: only visibly-active users appear (invisible
   * / appear-offline users are omitted). Sent to a client on connect so it learns the
   * current online set instead of relying on stale DB status.
   */
  snapshot(): { userId: string; status: string }[] {
    const out: { userId: string; status: string }[] = [];
    for (const [userId, status] of this.statuses) {
      if (ACTIVE.includes(status)) out.push({ userId, status });
    }
    return out;
  }
}
