import {
  Controller,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  UploadedFile,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ShareService, UploadedAttachment } from '../share/share.service';
import type { User } from '@prisma/client';
import { diskStorage } from 'multer';
import { mkdirSync } from 'fs';
import { unlink } from 'fs/promises';
import { randomUUID } from 'crypto';
import { tmpdir } from 'os';
import { join } from 'path';

function positiveEnv(name: string): number | undefined {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

const configuredMaxFiles = positiveEnv('UPLOAD_MAX_FILES');
const configuredMaxFileBytes = positiveEnv('UPLOAD_MAX_FILE_BYTES');
const uploadTempDir = join(tmpdir(), 'openchat-uploads');
mkdirSync(uploadTempDir, { recursive: true, mode: 0o700 });
const uploadStorage = diskStorage({
  destination: uploadTempDir,
  filename: (_request, _file, done) => done(null, randomUUID()),
});

type SpoolFile = { originalname: string; path: string; mimetype: string; size: number };

async function cleanup(files: SpoolFile[]): Promise<void> {
  await Promise.all(files.map((file) => unlink(file.path).catch(() => undefined)));
}

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
    FilesInterceptor('files', configuredMaxFiles, {
      storage: uploadStorage,
      limits: configuredMaxFileBytes ? { fileSize: configuredMaxFileBytes } : {},
    }),
  )
  async upload(
    @UploadedFiles() files: SpoolFile[],
    @CurrentUser() user: User,
  ): Promise<{ attachments: UploadedAttachment[]; rejected: { name: string; reason: string }[] }> {
    if (!files || files.length === 0) {
      throw new HttpException('No files provided', HttpStatus.BAD_REQUEST);
    }

    const fileData = files.map((f) => ({
      originalname: f.originalname,
      path: f.path,
      mimetype: f.mimetype,
      size: f.size,
    }));

    try {
      return await this.share.uploadForUser(user.id, fileData);
    } finally {
      await cleanup(files);
    }
  }

  @Post('waveform')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: uploadStorage,
      limits: configuredMaxFileBytes ? { fileSize: configuredMaxFileBytes } : {},
    }),
  )
  async waveform(
    @UploadedFile() file: SpoolFile | undefined,
    @CurrentUser() user: User,
  ): Promise<{ peaks: number[] | null; duration: number | null }> {
    if (!file) throw new HttpException('No file provided', HttpStatus.BAD_REQUEST);
    try {
      return await this.share.analyzeWaveformForUser(user.id, file);
    } finally {
      await cleanup([file]);
    }
  }
}
