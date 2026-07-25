import {
  Controller,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ShareService, UploadedAttachment } from '../share/share.service';
import type { User } from '@prisma/client';

/**
 * P5-02 — FR-MED-002: Authenticated upload broker.
 *
 * Accepts multipart files from mobile clients (bearer or cookie auth),
 * streams them to OpenShare, and returns web-compatible attachment refs.
 */
@Controller('uploads')
@UseGuards(AuthGuard)
export class UploadsController {
  constructor(private readonly share: ShareService) {}

  @Post()
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB per file
    }),
  )
  async upload(
    @UploadedFiles() files: Array<{ originalname: string; buffer: Buffer; mimetype: string; size: number }>,
    @CurrentUser() _user: User,
  ): Promise<UploadedAttachment[]> {
    if (!files || files.length === 0) {
      throw new HttpException('No files provided', HttpStatus.BAD_REQUEST);
    }

    const fileData = files.map((f) => ({
      filename: f.originalname,
      buffer: f.buffer,
      mimeType: f.mimetype,
    }));

    return this.share.uploadFiles(fileData);
  }
}
