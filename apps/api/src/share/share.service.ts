import { Injectable, HttpException, HttpStatus, NotFoundException, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { UploadsController } from './uploads.controller';

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
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

interface ShareUploadResult {
  saved: { id: string; media_type: string }[];
  rejected: { name: string; reason: string }[];
}

@Injectable()
export class ShareService {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.baseUrl = (this.configService.get<string>('SHARE_BASE_URL') ?? '').replace(/\/$/, '');
    this.apiKey = this.configService.get<string>('SHARE_API_KEY') ?? '';
  }

  /**
   * Upload files to Share on behalf of a user (server-to-server, using the shared
   * service key + the user's Authentik sub as owner). Lets native clients upload
   * through the API without holding Share credentials or a browser cookie.
   */
  async uploadForUser(userId: string, files: UploadInput[]): Promise<{ attachments: UploadedAttachment[]; rejected: { name: string; reason: string }[] }> {
    if (!this.baseUrl) throw new HttpException('File hosting is not configured', HttpStatus.SERVICE_UNAVAILABLE);
    if (files.length === 0) return { attachments: [], rejected: [] };

    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { authSub: true, username: true } });
    if (!user) throw new NotFoundException('User not found');

    const form = new FormData();
    for (const f of files) form.append('files', new Blob([new Uint8Array(f.buffer)], { type: f.mimetype }), f.originalname);
    form.append('source', 'chat');

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'X-Share-User-Sub': user.authSub,
          'X-Share-User-Name': user.username,
        },
        body: form,
      });
    } catch {
      throw new HttpException('Could not reach file hosting', HttpStatus.BAD_GATEWAY);
    }
    if (!res.ok) {
      throw new HttpException('File hosting rejected the upload', HttpStatus.BAD_GATEWAY);
    }

    const data = (await res.json()) as ShareUploadResult;
    const rejectedNames = new Set((data.rejected ?? []).map((r) => r.name));
    const accepted = files.filter((f) => !rejectedNames.has(f.originalname));

    const attachments: UploadedAttachment[] = (data.saved ?? []).map((sv, i) => {
      const f = accepted[i] ?? files[i];
      return {
        id: sv.id,
        shareAssetId: sv.id,
        filename: f?.originalname ?? sv.id,
        mimeType: f?.mimetype ?? '',
        size: String(f?.size ?? 0),
        url: `${this.baseUrl}/raw/${sv.id}`,
        thumbnailUrl: `${this.baseUrl}/thumb/${sv.id}`,
        width: null,
        height: null,
        durationMs: null,
      };
    });
    return { attachments, rejected: data.rejected ?? [] };
  }
}

@Module({
  controllers: [UploadsController],
  providers: [ShareService],
  exports: [ShareService],
})
export class ShareModule {}
