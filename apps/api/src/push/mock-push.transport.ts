/**
 * @satisfies FR-NOTIF-001
 *
 * In-memory push transport for tests. Records every send call and allows
 * configuring which tokens should simulate failure (invalid/expired).
 */
import type { PushTransport, PushPayload, SendPushResult } from './push-transport.interface';

export interface MockSendRecord {
  tokens: string[];
  payload: PushPayload;
}

export class MockPushTransport implements PushTransport {
  /** Ordered list of every sendPush call. */
  readonly sends: MockSendRecord[] = [];

  /** Tokens that will be reported as invalid on the next call. */
  private invalidTokens: Set<string> = new Set();

  /** Mark tokens as invalid for the next send. */
  setInvalidTokens(tokens: string[]): void {
    this.invalidTokens = new Set(tokens);
  }

  /** Clear all recorded sends. */
  reset(): void {
    this.sends.length = 0;
    this.invalidTokens.clear();
  }

  async sendPush(tokens: string[], payload: PushPayload): Promise<SendPushResult> {
    this.sends.push({ tokens: [...tokens], payload: { ...payload } });

    const invalid: string[] = [];
    let success = 0;
    for (const t of tokens) {
      if (this.invalidTokens.has(t)) {
        invalid.push(t);
      } else {
        success++;
      }
    }
    return { success, invalidTokens: invalid };
  }
}
