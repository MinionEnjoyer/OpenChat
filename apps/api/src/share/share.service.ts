import { Injectable, HttpException, HttpStatus, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { Readable } from 'stream';
import { ReadableStream as WebReadableStream } from 'stream/web';
import { createReadStream } from 'fs';
import { unlink } from 'fs/promises';
import { randomUUID } from 'crypto';

/** OpenShare upload broker and authenticated media proxy. */

/** One uploaded file's stored reference, in the shape chat attachments use. */
export interface UploadedAttachment {
  id: string;
  shareAssetId: string;
  filename: string;
  mimeType: string;
  size: string;
  url: string;
  thumbnailUrl: string | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
}

export interface UploadInput {
  path: string;
  originalname: string;
  mimetype: string;
  size: number;
}

function multipartBody(files: UploadInput[], fieldName: string, fields: Record<string, string> = {}) {
  const boundary = `----openchat-${randomUUID()}`;
  async function* generate() {
    for (const file of files) {
      const safeName = file.originalname.replace(/[\r\n"]/g, '_');
      yield Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${safeName}"\r\n` +
        `Content-Type: ${file.mimetype || 'application/octet-stream'}\r\n\r\n`,
      );
      for await (const chunk of createReadStream(file.path)) yield chunk;
      yield Buffer.from('\r\n');
    }
    for (const [name, value] of Object.entries(fields)) {
      yield Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`);
    }
    yield Buffer.from(`--${boundary}--\r\n`);
  }
  return { body: Readable.from(generate()), contentType: `multipart/form-data; boundary=${boundary}` };
}

async function cleanupUploads(files: UploadInput[]): Promise<void> {
  await Promise.all(files.map((file) => unlink(file.path).catch(() => undefined)));
}

interface ShareUploadResult {
  saved: { id: string; media_type: string }[];
  rejected: { name: string; reason: string }[];
}

const PROXY_RESPONSE_HEADERS = new Set([
  'accept-ranges',
  'cache-control',
  'content-length',
  'content-range',
  'content-type',
  'etag',
  'last-modified',
]);

@Injectable()
export class ShareService {
  private readonly logger = new Logger(ShareService.name);
  private readonly shareBaseUrl: string;
  private readonly shareApiKey: string;

  constructor(
    private configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.shareBaseUrl = this.configService.get<string>('SHARE_BASE_URL')!;
    this.shareApiKey = this.configService.get<string>('SHARE_API_KEY')!;
    if (this.shareApiKey) {
      this.logger.log('SHARE_API_KEY configured — service API available');
    }
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
      if (PROXY_RESPONSE_HEADERS.has(key.toLowerCase())) headers[key] = value;
    });

    // Add cache headers
    headers['cache-control'] = 'private, max-age=86400';

    // Convert web ReadableStream to Node Readable
    const nodeStream = Readable.fromWeb(resp.body as WebReadableStream);
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
      if (PROXY_RESPONSE_HEADERS.has(key.toLowerCase())) headers[key] = value;
    });

    headers['cache-control'] = 'private, max-age=86400';

    const nodeStream = Readable.fromWeb(resp.body as WebReadableStream);
    return { stream: nodeStream, headers, status: resp.status };
  }

  // ── Upstream: authenticated upload for native/desktop clients ─────

  /**
   * Upload files to Share on behalf of a user (server-to-server, using the shared
   * service key + the user's Authentik sub as owner). Lets native clients upload
   * through the API without holding Share credentials or a browser cookie.
   */
  async uploadForUser(userId: string, files: UploadInput[]): Promise<{ attachments: UploadedAttachment[]; rejected: { name: string; reason: string }[] }> {
    if (!this.shareBaseUrl) throw new HttpException('File hosting is not configured', HttpStatus.SERVICE_UNAVAILABLE);
    if (files.length === 0) return { attachments: [], rejected: [] };

    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { authSub: true, username: true } });
    if (!user) throw new NotFoundException('User not found');

    try {
      const multipart = multipartBody(files, 'files', { source: 'chat' });
      const res = await fetch(`${this.shareBaseUrl}/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.shareApiKey}`,
          'X-Share-User-Sub': user.authSub,
          'X-Share-User-Name': user.username,
          'Content-Type': multipart.contentType,
        },
        body: multipart.body as any,
        duplex: 'half',
      } as RequestInit & { duplex: 'half' });
      if (!res.ok) throw new HttpException('File hosting rejected the upload', HttpStatus.BAD_GATEWAY);

      const data = (await res.json()) as ShareUploadResult;
      const rejectedNames = new Set((data.rejected ?? []).map((r) => r.name));
      const accepted = files.filter((f) => !rejectedNames.has(f.originalname));
      const attachments: UploadedAttachment[] = (data.saved ?? []).map((sv, i) => {
        const f = accepted[i] ?? files[i];
        return {
          id: sv.id, shareAssetId: sv.id, filename: f?.originalname ?? sv.id,
          mimeType: f?.mimetype ?? '', size: String(f?.size ?? 0),
          url: `/api/media/${sv.id}/raw`, thumbnailUrl: `/api/media/${sv.id}/thumb`,
          width: null, height: null, durationMs: null,
        };
      });
      return { attachments, rejected: data.rejected ?? [] };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException('Could not reach file hosting', HttpStatus.BAD_GATEWAY);
    } finally {
      await cleanupUploads(files);
    }
  }

  async analyzeWaveformForUser(
    userId: string,
    file: UploadInput,
  ): Promise<{ peaks: number[] | null; duration: number | null }> {
    if (!this.shareBaseUrl || !this.shareApiKey) {
      throw new HttpException('File hosting is not configured', HttpStatus.SERVICE_UNAVAILABLE);
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { authSub: true, username: true },
    });
    if (!user) throw new NotFoundException('User not found');

    try {
      const multipart = multipartBody([file], 'file');
      const response = await fetch(`${this.shareBaseUrl}/waveform`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.shareApiKey}`,
          'X-Share-User-Sub': user.authSub,
          'X-Share-User-Name': user.username,
          'Content-Type': multipart.contentType,
        },
        body: multipart.body as any,
        duplex: 'half',
      } as RequestInit & { duplex: 'half' });
      if (!response.ok) throw new HttpException('File hosting rejected waveform analysis', HttpStatus.BAD_GATEWAY);
      return response.json();
    } finally {
      await cleanupUploads([file]);
    }
  }
}
