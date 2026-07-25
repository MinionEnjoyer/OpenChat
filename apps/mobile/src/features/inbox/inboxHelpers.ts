/**
 * FR-SOC-005 — Notifications inbox domain helpers.
 *
 * Pure functions for processing notification data.
 *
 * @satisfies FR-SOC-005
 */

import type { NotificationsResponse } from '../../api/schema';

/** Split the total count into friendRequest and serverInvite components. */
export function counts(
  resp: NotificationsResponse,
): { frCount: number; siCount: number } {
  return {
    frCount: resp.friendRequests.length,
    siCount: resp.serverInvites.length,
  };
}

/**
 * Validate that the notification response shape matches the expected contract.
 * A naive/malformed response might be a bare array or missing required fields.
 * Returns the validated response, or throws if the shape is wrong.
 */
export function validateNotificationsShape(data: unknown): NotificationsResponse {
  if (Array.isArray(data)) {
    throw new Error('Notifications response must be an object, not a bare array');
  }
  if (data === null || typeof data !== 'object') {
    throw new Error('Notifications response must be a non-null object');
  }
  const obj = data as Record<string, unknown>;
  if (!Array.isArray(obj.friendRequests)) {
    throw new Error('Notifications response missing friendRequests array');
  }
  if (!Array.isArray(obj.serverInvites)) {
    throw new Error('Notifications response missing serverInvites array');
  }
  if (typeof obj.count !== 'number') {
    throw new Error('Notifications response missing count (number)');
  }
  // Verify count integrity: count must equal sum of lengths
  const frLen = (obj.friendRequests as unknown[]).length;
  const siLen = (obj.serverInvites as unknown[]).length;
  if ((obj.count as number) !== frLen + siLen) {
    throw new Error(
      `Notifications count (${obj.count}) does not match sum of lengths (${frLen + siLen})`,
    );
  }
  return data as NotificationsResponse;
}

/**
 * Check if the serverInvites list contains an invitation for a given serverId.
 * Needed for integration tests to find the specific invite to accept/decline.
 */
export function findInviteByServer(
  serverInvites: NotificationsResponse['serverInvites'],
  serverId: string,
): NotificationsResponse['serverInvites'][number] | undefined {
  return serverInvites.find((i) => i.server.id === serverId);
}
