/**
 * Typed REST client (06 §2 api/): base URL from lib/config, bearer header,
 * per-call request-id (04 §10), and a single-flight refresh interceptor
 * (FR-AUTH-010): concurrent 401s queue behind ONE token refresh; refresh
 * failure broadcasts a hard logout. No retry storms — one refresh attempt per
 * 401, then fail.
 */
import { logger } from '../lib/logger';

export interface ApiError {
  status: number;
  code?: string;
  requestId: string;
  retriable: boolean;
  message: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

interface ClientDeps {
  baseUrl: string;
  getTokens: () => TokenPair | null;
  setTokens: (tokens: TokenPair) => Promise<void> | void;
  onHardLogout: () => void;
}

let requestCounter = 0;
function nextRequestId(): string {
  requestCounter += 1;
  return `m-${Date.now().toString(36)}-${requestCounter}`;
}

export class ApiClient {
  private refreshing: Promise<boolean> | null = null;

  constructor(private readonly deps: ClientDeps) {}

  async request<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    const attempt = await this.rawRequest<T>(path, init);
    if (attempt.status !== 401) return this.unwrap(attempt);

    // 401 → try exactly one (shared) refresh, then replay once.
    const refreshed = await this.refreshOnce();
    if (!refreshed) {
      this.deps.onHardLogout();
      throw attempt.error;
    }
    const retry = await this.rawRequest<T>(path, init);
    if (retry.status === 401) {
      // Refresh "succeeded" but the API still rejects us — state is broken; clear it.
      this.deps.onHardLogout();
    }
    return this.unwrap(retry);
  }

  private unwrap<T>(r: { status: number; body: T; error: ApiError }): T {
    if (r.status >= 200 && r.status < 300) return r.body;
    throw r.error;
  }

  private async rawRequest<T>(
    path: string,
    init: { method?: string; body?: unknown },
  ): Promise<{ status: number; body: T; error: ApiError }> {
    const requestId = nextRequestId();
    const headers: Record<string, string> = { 'x-request-id': requestId };
    const tokens = this.deps.getTokens();
    if (tokens) headers.authorization = `Bearer ${tokens.accessToken}`;
    if (init.body !== undefined) headers['content-type'] = 'application/json';

    let status = 0;
    let body: unknown = null;
    let message = '';
    try {
      const res = await fetch(`${this.deps.baseUrl}${path}`, {
        method: init.method ?? 'GET',
        headers,
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      });
      status = res.status;
      const text = await res.text();
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = text;
      }
      if (status >= 400) {
        message = (body as { message?: string })?.message ?? `HTTP ${status}`;
      }
    } catch (e) {
      status = 0;
      message = e instanceof Error ? e.message : 'network error';
    }

    const error: ApiError = {
      status,
      requestId,
      // Network failures and 5xx are worth retrying; 4xx are not.
      retriable: status === 0 || status >= 500,
      message,
    };
    logger.log(status >= 400 || status === 0 ? 'warn' : 'debug', `${init.method ?? 'GET'} ${path} → ${status}`, undefined, requestId);
    return { status, body: body as T, error };
  }

  /** Single-flight: every concurrent 401 awaits the same refresh promise. */
  private refreshOnce(): Promise<boolean> {
    if (!this.refreshing) {
      this.refreshing = (async () => {
        const tokens = this.deps.getTokens();
        if (!tokens) return false;
        const r = await this.rawRequest<{ accessToken: string; refreshToken: string }>(
          '/auth/oauth/token',
          { method: 'POST', body: { grantType: 'refresh_token', refreshToken: tokens.refreshToken } },
        );
        if (r.status !== 201 || !r.body?.accessToken) return false;
        await this.deps.setTokens({ accessToken: r.body.accessToken, refreshToken: r.body.refreshToken });
        return true;
      })().finally(() => {
        this.refreshing = null;
      });
    }
    return this.refreshing;
  }
}
