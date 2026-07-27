import { Controller, Post, UseGuards, UseInterceptors, UploadedFiles, BadRequestException } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { SessionGuard } from '../auth/session.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ShareService, type UploadInput } from './share.service';
import type { User } from '@prisma/client';

const MAX_FILES = 10;
const MAX_FILE_BYTES = 100 * 1024 * 1024; // 100 MB per file

/**
 * First-class authenticated upload endpoint. Native clients (RN/desktop) POST
 * multipart files here and the API stores them in Share on the user's behalf —
 * no Share credentials or browser cookie needed on the client.
 */
@Controller('uploads')
@UseGuards(SessionGuard)
export class UploadsController {
  constructor(private readonly share: ShareService) {}

  @Post()
  @UseInterceptors(FilesInterceptor('files', MAX_FILES, { limits: { fileSize: MAX_FILE_BYTES } }))
  async upload(@CurrentUser() user: User, @UploadedFiles() files?: UploadInput[]) {
    if (!files || files.length === 0) throw new BadRequestException('No files provided (field name: "files")');
    return this.share.uploadForUser(user.id, files);
  }
}
