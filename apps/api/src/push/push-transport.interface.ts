/**
 * @satisfies FR-NOTIF-001
 *
 * Narrow push transport contract. All production code depends on this interface;
 * tests inject the mock implementation.
 */
export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
  android?: { channelId: string; priority: string };
  apns?: {
    headers: Record<string, string>;
    payload: { aps: { sound: string; badge?: number } };
  };
}

export interface SendPushResult {
  /** Count of tokens that were sent successfully. */
  success: number;
  /** Tokens that the transport reported as invalid/expired and should be pruned. */
  invalidTokens: string[];
}

export const PUSH_TRANSPORT = Symbol('PUSH_TRANSPORT');

export interface PushTransport {
  /**
   * Send a push notification to a list of device tokens.
   * Returns aggregate result: success count + list of tokens to prune.
   * Throws only for unrecoverable transport failures (network down, auth expired).
   */
  sendPush(tokens: string[], payload: PushPayload): Promise<SendPushResult>;
}
