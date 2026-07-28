/**
 * FR-SRV-010: Announcement channel read-only helpers.
 * Pure functions, no I/O — directly exercisable by unit tests.
 */
import { Permission } from '../../api/schema';
import type { ChannelPermissionsResponse } from '../../api/schema';

/**
 * Returns whether the user can send messages in the given channel.
 * For non-ANNOUNCEMENT channels, always returns true (server-level
 * permissions gate send on the backend).
 * For ANNOUNCEMENT channels, checks the channel-level permissions
 * (post-overwrites) for SEND_MESSAGES.
 *
 * @satisfies FR-SRV-010
 */
export function canSendInChannel(
  channelType: string | undefined,
  channelPerms: ChannelPermissionsResponse | undefined,
): boolean {
  if (channelType !== 'ANNOUNCEMENT') return true;
  if (!channelPerms) return false;
  try {
    return (BigInt(channelPerms.permissions) & Permission.SEND_MESSAGES) !== 0n;
  } catch {
    return false;
  }
}
