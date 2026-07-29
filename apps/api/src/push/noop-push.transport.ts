/**
 * @satisfies FR-NOTIF-001
 *
 * No-op push transport used when FCM_SERVICE_ACCOUNT is unset.
 * Logs a throttled warning on send so operators know push is disabled,
 * but never throws and never floods the log.
 */
import { Logger } from '@nestjs/common';
import type { PushTransport, PushPayload, SendPushResult } from './push-transport.interface';

export class NoopPushTransport implements PushTransport {
  private readonly logger = new Logger(NoopPushTransport.name);
  private lastWarn = 0;

  async sendPush(_tokens: string[], _payload: PushPayload): Promise<SendPushResult> {
    const now = Date.now();
    if (now - this.lastWarn > 60_000) {
      this.lastWarn = now;
      this.logger.warn(
        'FCM_SERVICE_ACCOUNT is not set — push notifications are disabled. ' +
          'To enable FCM HTTP v1 delivery, set the env var to a valid JSON service-account key.',
      );
    }
    return { success: 0, invalidTokens: [] };
  }
}
