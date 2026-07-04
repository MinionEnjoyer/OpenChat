import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface UploadUrlRequest {
  filename: string;
  mimeType: string;
  size: number;
}

interface ShareUploadResponse {
  uploadTarget: {
    url: string;
    method: string;
    fields?: Record<string, string>;
  };
  assetId: string;
}

interface ShareMetadataResponse {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  url: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  durationMs?: number;
}

@Injectable()
export class ShareService {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(private configService: ConfigService) {
    this.baseUrl = this.configService.get<string>('SHARE_BASE_URL')!;
    this.apiKey = this.configService.get<string>('SHARE_API_KEY')!;
  }

  async requestUploadUrl({ filename, mimeType, size }: UploadUrlRequest): Promise<ShareUploadResponse> {
    const response = await fetch(`${this.baseUrl}/api/assets/upload-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ filename, mimeType, size }),
    });

    if (!response.ok) {
      throw new HttpException(
        await response.text(),
        response.status === 401 || response.status === 403 ? HttpStatus.FORBIDDEN : HttpStatus.BAD_GATEWAY,
      );
    }

    return response.json();
  }

  async getAssetMetadata(assetId: string): Promise<ShareMetadataResponse> {
    const response = await fetch(`${this.baseUrl}/api/assets/${assetId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      throw new HttpException(
        await response.text(),
        response.status === 404 ? HttpStatus.NOT_FOUND : HttpStatus.BAD_GATEWAY,
      );
    }

    return response.json();
  }
}

import { Module } from '@nestjs/common';

@Module({
  providers: [ShareService],
  exports: [ShareService],
})
export class ShareModule {}
