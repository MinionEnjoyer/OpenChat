import { Injectable, HttpException, HttpStatus, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'stream';

/**
 * P5-01 + P5-02 — ShareService with Bearer-token service API (FR-MED-001) +
 * upload broker + authenticated media proxy (FR-MED-002, FR-MED-003).
 *
 * FR-MED-001 — Bearer-auth'd service API:
 *   POST /api/assets          — multipart upload (Bearer SHARE_API_KEY)
 *   GET  /api/assets/{id}     — asset metadata
 *   GET  /api/assets/{id}/raw — raw bytes with Range/ETag
 *   GET  /api/assets/{id}/thumb — thumbnail bytes
 *
 * These endpoints do NOT exist on OpenShare yet (2026-07-25). This module's
 * uploadFiles() tries the service API first; if the endpoint returns 404, it
 * falls back to cookie-based POST /upload (P0-02a bypass). Once OpenShare
 * implements FR-MED-001, the fallback can be removed.
 *
 * Cookie-based endpoints (unchanged for backward compat / web client):
 *   POST /upload          — multipart upload (cookie session)
 *   GET  /raw/{id}        — public raw bytes
 *   GET  /thumb/{id}      — public thumbnail
 *   POST /auth/dev-login  — dev-only session bootstrap (DEV_AUTH=1)
 */

export interface UploadedAttachment {
  shareAssetId: string;
  filename: string;
  mimeType: string;
  size: number;
  url: string;
  thumbnailUrl: string | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
}

/** Full asset metadata per FR-MED-001 spec (14-PHASE5-MEDIA.md P5-01). */
export interface AssetMetadata {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  mediaType: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  sha256: string;
}

interface ShareUploadResponse {
  saved: Array<{ id: string; media_type: string }>;
  rejected: Array<{ name: string; reason: string }>;
}

@Injectable()
export class ShareService {
  private readonly logger = new Logger(ShareService.name);
  private readonly shareBaseUrl: string;
  private readonly shareApiKey: string | undefined;

  /** Cached OpenShare session cookie (obtained via dev-login). Lazily initialized. */
  private shareCookie: string | null = null;
  private cookieExpiresAt: number = 0;

  constructor(private configService: ConfigService) {
    this.shareBaseUrl = this.configService.get<string>('SHARE_BASE_URL')!;
    this.shareApiKey = this.configService.get<string>('SHARE_API_KEY');
    if (this.shareApiKey) {
      this.logger.log('SHARE_API_KEY configured — service API available');
    }
  }

  // ── Bearer auth helper ─────────────────────────────────────────────

  /** Returns Authorization header if SHARE_API_KEY is configured. */
  private getBearerHeaders(): Record<string, string> | null {
    if (!this.shareApiKey) return null;
    return { authorization: `Bearer ${this.shareApiKey}` };
  }

  // ── Session management (cookie-based fallback) ─────────────────────

  private async ensureSession(): Promise<string> {
    const now = Date.now();
    if (this.shareCookie && now < this.cookieExpiresAt - 60_000) {
      return this.shareCookie;
    }

    const formBody = new URLSearchParams({ username: 'chat-broker' });
    const resp = await fetch(`${this.shareBaseUrl}/auth/dev-login`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: formBody.toString(),
      redirect: 'manual',
    });

    if (!resp.ok) {
      throw new HttpException(
        `Share dev-login failed: ${resp.status}`,
        HttpStatus.BAD_GATEWAY,
      );
    }

    const setCookie = resp.headers.get('set-cookie');
    if (!setCookie) {
      throw new HttpException(
        'Share dev-login returned no session cookie',
        HttpStatus.BAD_GATEWAY,
      );
    }

    // Extract just the session cookie value (first key=value before any ';')
    this.shareCookie = setCookie.split(';')[0].trim();
    this.cookieExpiresAt = now + 3600_000; // 1h
    this.logger.log('Share session established');

    return this.shareCookie;
  }

  // ── FR-MED-001: Service API upload ─────────────────────────────────

  /**
   * Upload files via the Bearer-token service API (POST /api/assets).
   *
   * This is the FR-MED-001 target path. Returns full AssetMetadata per the spec.
   * Falls back to null if the endpoint is not available (404).
   *
   * @satisfies FR-MED-001
   */
  private async uploadViaServiceApi(
    files: Array<{ filename: string; buffer: Buffer; mimeType: string }>,
  ): Promise<AssetMetadata[]> {
    const bearerHeaders = this.getBearerHeaders();
    if (!bearerHeaders) return []; // No API key configured — skip

    const form = new FormData();
    for (const f of files) {
      const blob = new Blob([new Uint8Array(f.buffer)], { type: f.mimeType || 'application/octet-stream' });
      form.append('file', blob, f.filename);
    }
    form.append('source', 'chat');

    const resp = await fetch(`${this.shareBaseUrl}/api/assets`, {
      method: 'POST',
      headers: bearerHeaders,
      body: form,
    });

    if (resp.status === 404) {
      // Route not built yet (OpenShare pre-FR-MED-001) — caller falls back
      this.logger.warn('POST /api/assets returned 404 — falling back to cookie-based upload');
      return [];
    }

    if (resp.status === 401 || resp.status === 403) {
      throw new HttpException(
        `Share service API auth rejected (${resp.status}) — check SHARE_API_KEY`,
        HttpStatus.BAD_GATEWAY,
      );
    }

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new HttpException(
        `Share service API upload failed (${resp.status}): ${text}`,
        HttpStatus.BAD_GATEWAY,
      );
    }

    const data: AssetMetadata = await resp.json();
    return [data];
  }

  /**
   * Convert AssetMetadata (from service API) to UploadedAttachment refs.
   *
   * @satisfies FR-MED-001
   */
  private metadataToAttachment(meta: AssetMetadata, original: { filename: string; buffer: Buffer; mimeType: string }): UploadedAttachment {
    return {
      shareAssetId: meta.id,
      filename: meta.filename ?? original.filename,
      mimeType: meta.mimeType ?? original.mimeType,
      size: meta.size ?? original.buffer.length,
      url: `/api/media/${meta.id}/raw`,
      thumbnailUrl: `/api/media/${meta.id}/thumb`,
      width: meta.width ?? null,
      height: meta.height ?? null,
      durationMs: meta.durationMs ?? null,
    };
  }

  // ── FR-MED-002: Upload broker ────────────────────────────────────

  /**
   * Upload files to OpenShare and return web-compatible attachment refs.
   *
   * Tries the service API (Bearer auth, FR-MED-001) first; falls back to
   * cookie-based POST /upload if the endpoint is not available.
   *
   * @satisfies FR-MED-002
   */
  async uploadFiles(
    files: Array<{ filename: string; buffer: Buffer; mimeType: string }>,
  ): Promise<UploadedAttachment[]> {
    // Try service API first (FR-MED-001)
    const serviceResults = await this.uploadViaServiceApi(files);
    if (serviceResults.length > 0) {
      return serviceResults.map((meta, i) =>
        this.metadataToAttachment(meta, files[i]),
      );
    }

    // Fallback: cookie-based POST /upload
    const cookie = await this.ensureSession();

    const form = new FormData();
    for (const f of files) {
      const blob = new Blob([new Uint8Array(f.buffer)], { type: f.mimeType || 'application/octet-stream' });
      form.append('files', blob, f.filename);
    }
    form.append('source', 'chat');

    const resp = await fetch(`${this.shareBaseUrl}/upload`, {
      method: 'POST',
      headers: { cookie },
      body: form,
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new HttpException(
        `Share upload failed (${resp.status}): ${text}`,
        HttpStatus.BAD_GATEWAY,
      );
    }

    const data: ShareUploadResponse = await resp.json();
    const rejectedNames = new Set((data.rejected ?? []).map((r) => r.name));

    // Build attachment refs matching the web client's Attachment shape.
    // url/thumbnailUrl use API proxy paths so mobile can render without Share cookies.
    return data.saved
      .filter((s) => !rejectedNames.has(s.id)) // unlikely but defensive
      .map((s, i) => {
        // Match files by index (OpenShare preserves order for accepted files)
        const file = files[i];
        return {
          shareAssetId: s.id,
          filename: file?.filename ?? s.id,
          mimeType: file?.mimeType ?? 'application/octet-stream',
          size: file?.buffer.length ?? 0,
          url: `/api/media/${s.id}/raw`,
          thumbnailUrl: `/api/media/${s.id}/thumb`,
          width: null,
          height: null,
          durationMs: null,
        };
      });
  }

  // ── FR-MED-001: Service API metadata ──────────────────────────────

  /**
   * Fetch asset metadata via the service API (GET /api/assets/{id}).
   *
   * @satisfies FR-MED-001
   */
  async getAssetMetadata(assetId: string): Promise<AssetMetadata> {
    const bearerHeaders = this.getBearerHeaders();
    if (!bearerHeaders) {
      throw new HttpException(
        'SHARE_API_KEY not configured',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const resp = await fetch(
      `${this.shareBaseUrl}/api/assets/${encodeURIComponent(assetId)}`,
      { headers: { ...bearerHeaders, accept: 'application/json' } },
    );

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new HttpException(
        `Share metadata fetch failed (${resp.status}): ${text}`,
        resp.status === 404 ? HttpStatus.NOT_FOUND : HttpStatus.BAD_GATEWAY,
      );
    }

    return resp.json();
  }

  // ── FR-MED-003: Media proxy ──────────────────────────────────────

  /**
   * Proxy a raw asset from OpenShare. Returns the response body as a Readable
   * stream and the response headers (content-type, content-length, etag, etc.).
   * OpenShare's /raw/{id} is public — no auth needed to fetch it.
   */
  async proxyRaw(
    assetId: string,
    rangeHeader?: string,
  ): Promise<{ stream: Readable; headers: Record<string, string>; status: number }> {
    const url = `${this.shareBaseUrl}/raw/${encodeURIComponent(assetId)}`;
    const fetchHeaders: Record<string, string> = {};
    if (rangeHeader) fetchHeaders['range'] = rangeHeader;

    const resp = await fetch(url, { headers: fetchHeaders });

    if (!resp.ok && resp.status !== 206) {
      const text = await resp.text().catch(() => '');
      throw new HttpException(
        `Share proxy failed (${resp.status}): ${text}`,
        resp.status === 404 ? HttpStatus.NOT_FOUND : HttpStatus.BAD_GATEWAY,
      );
    }

    const headers: Record<string, string> = {};
    resp.headers.forEach((value, key) => {
      // Drop transfer-encoding since we're relaying as a regular response
      if (key.toLowerCase() === 'transfer-encoding') return;
      headers[key] = value;
    });

    // Add cache headers
    headers['cache-control'] = 'private, max-age=86400';

    // Convert web ReadableStream to Node Readable
    const nodeStream = Readable.fromWeb(resp.body as any);
    return { stream: nodeStream, headers, status: resp.status };
  }

  /**
   * Proxy a thumbnail from OpenShare. Same as proxyRaw but for /thumb/{id}.
   */
  async proxyThumb(
    assetId: string,
  ): Promise<{ stream: Readable; headers: Record<string, string>; status: number }> {
    const url = `${this.shareBaseUrl}/thumb/${encodeURIComponent(assetId)}`;
    const resp = await fetch(url);

    if (!resp.ok) {
      throw new HttpException(
        `Share thumb proxy failed (${resp.status})`,
        resp.status === 404 ? HttpStatus.NOT_FOUND : HttpStatus.BAD_GATEWAY,
      );
    }

    const headers: Record<string, string> = {};
    resp.headers.forEach((value, key) => {
      if (key.toLowerCase() === 'transfer-encoding') return;
      headers[key] = value;
    });

    headers['cache-control'] = 'private, max-age=86400';

    const nodeStream = Readable.fromWeb(resp.body as any);
    return { stream: nodeStream, headers, status: resp.status };
  }
}

@Module({
  providers: [ShareService],
  exports: [ShareService],
})
export class ShareModule {}
