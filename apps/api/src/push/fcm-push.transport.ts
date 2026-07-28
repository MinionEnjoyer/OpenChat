/**
 * @satisfies FR-NOTIF-001
 *
 * Firebase Cloud Messaging HTTP v1 transport.
 *
 * REQUIRES: FCM_SERVICE_ACCOUNT env var (JSON service-account key).
 * Degrades gracefully when absent (null-object selected in the module);
 * throws only for malformed JSON (operator error). The sendPush guard
 * is a safety net — under normal operation the module factory routes to
 * NoopPushTransport before this transport is ever constructed.
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PushTransport, PushPayload, SendPushResult } from './push-transport.interface';

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

interface FcmV1Message {
  message: {
    token: string;
    notification?: { title: string; body: string };
    data?: Record<string, string>;
    android?: { notification: { channel_id: string } };
    apns?: {
      headers: Record<string, string>;
      payload: { aps: { sound: string; badge?: number } };
    };
  };
}

@Injectable()
export class FcmPushTransport implements PushTransport {
  private readonly logger = new Logger(FcmPushTransport.name);
  private readonly projectId: string;
  private readonly serviceAccount: ServiceAccount;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  private configured = false;

  constructor(private readonly configService: ConfigService) {
    const raw = this.configService.get<string>('FCM_SERVICE_ACCOUNT');
    if (!raw) {
      // Absent credentials → null-object handles this; this instance is a
      // safety fallback that will no-op at sendPush level.
      this.serviceAccount = undefined!;
      this.projectId = '';
      return;
    }
    try {
      this.serviceAccount = JSON.parse(raw) as ServiceAccount;
      this.projectId = this.serviceAccount.project_id;
      if (!this.projectId) throw new Error('Missing project_id in service account');
      this.configured = true;
    } catch (err) {
      // Malformed JSON is always an operator error — fail loudly.
      throw new Error(
        `FCM_SERVICE_ACCOUNT is not valid JSON: ${(err as Error).message}`,
      );
    }
  }

  async sendPush(tokens: string[], payload: PushPayload): Promise<SendPushResult> {
    if (!this.configured) {
      this.logger.warn('FCM not configured — push send is a no-op.');
      return { success: 0, invalidTokens: [] };
    }
    if (tokens.length === 0) return { success: 0, invalidTokens: [] };

    const token = await this.getAccessToken();
    const url = `https://fcm.googleapis.com/v1/projects/${this.projectId}/messages:send`;

    let success = 0;
    const invalidTokens: string[] = [];

    // FCM HTTP v1: one message per token
    const results = await Promise.allSettled(
      tokens.map((deviceToken) => {
        const msg: FcmV1Message = {
          message: {
            token: deviceToken,
            notification: { title: payload.title, body: payload.body },
          },
        };
        if (payload.data) msg.message.data = payload.data;
        if (payload.android) {
          msg.message.android = { notification: { channel_id: payload.android.channelId } };
        }
        if (payload.apns) msg.message.apns = payload.apns;

        return fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(msg),
        });
      }),
    );

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status === 'rejected') {
        this.logger.warn(`FCM send failed for token ${tokens[i].slice(0, 8)}...: ${r.reason}`);
        continue;
      }
      const res = r.value;
      if (res.ok) {
        success++;
      } else {
        const body = await res.text().catch(() => '');
        if (
          res.status === 404 ||
          body.includes('UNREGISTERED') ||
          body.includes('INVALID_ARGUMENT') ||
          body.includes('registration-token-not-registered')
        ) {
          invalidTokens.push(tokens[i]);
          this.logger.debug(`Pruning invalid token ${tokens[i].slice(0, 8)}...`);
        } else {
          this.logger.warn(
            `FCM HTTP ${res.status} for token ${tokens[i].slice(0, 8)}...: ${body.slice(0, 200)}`,
          );
        }
      }
    }

    return { success, invalidTokens };
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry - 60_000) {
      return this.accessToken;
    }
    // RFC 7523: use service-account JWT to obtain an OAuth2 access token
    const jwt = await this.createJwt();
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Failed to obtain FCM access token: ${res.status} ${body}`);
    }
    const data = (await res.json()) as {
      access_token: string;
      expires_in: number;
    };
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in ?? 3600) * 1000;
    return this.accessToken!;
  }

  private async createJwt(): Promise<string> {
    const header = { alg: 'RS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const claims = {
      iss: this.serviceAccount.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    };

    const b64 = (obj: object) =>
      Buffer.from(JSON.stringify(obj)).toString('base64url');

    const unsigned = `${b64(header)}.${b64(claims)}`;
    const key = await this.importKey();
    const sig = await crypto.subtle.sign(
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      key,
      new TextEncoder().encode(unsigned),
    );
    const signature = Buffer.from(sig).toString('base64url');
    return `${unsigned}.${signature}`;
  }

  private async importKey(): Promise<CryptoKey> {
    const pem = this.serviceAccount.private_key;
    const der = pem
      .replace('-----BEGIN PRIVATE KEY-----', '')
      .replace('-----END PRIVATE KEY-----', '')
      .replace(/\s/g, '');
    return crypto.subtle.importKey(
      'pkcs8',
      Buffer.from(der, 'base64'),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    );
  }
}
