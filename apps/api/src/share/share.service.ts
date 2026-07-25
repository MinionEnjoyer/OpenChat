import { Injectable, HttpException, HttpStatus, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'stream';

/**
 * P5-02 — Upload broker + authenticated media proxy (FR-MED-002, FR-MED-003).
 *
 * Replaces the dead G2 code (POST /api/assets/upload-url and GET /api/assets/:id
 * — routes that do not exist on OpenShare). The web client's direct browser→Share
 * upload path is untouched (NFR-10).
 *
 * OpenShare endpoints used:
 *   POST /upload          — multipart upload (source=chat)
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

interface ShareUploadResponse {
  saved: Array<{ id: string; media_type: string }>;
  rejected: Array<{ name: string; reason: string }>;
}

@Injectable()
export class ShareService {
  private readonly logger = new Logger(ShareService.name);
  private readonly shareBaseUrl: string;

  /** Cached OpenShare session cookie (obtained via dev-login). Lazily initialized. */
  private shareCookie: string | null = null;
  private cookieExpiresAt: number = 0;

  constructor(private configService: ConfigService) {
    this.shareBaseUrl = this.configService.get<string>('SHARE_BASE_URL')!;
  }

  // ── Session management ───────────────────────────────────────────

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

  // ── FR-MED-002: Upload broker ────────────────────────────────────

  /**
   * Upload files to OpenShare and return web-compatible attachment refs.
   *
   * @param files Array of { filename, buffer, mimeType } — already parsed from multipart.
   * @param apiBaseUrl The OpenChat API base URL used to construct proxy URLs.
   */
  async uploadFiles(
    files: Array<{ filename: string; buffer: Buffer; mimeType: string }>,
  ): Promise<UploadedAttachment[]> {
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
