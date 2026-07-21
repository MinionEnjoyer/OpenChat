import { Module } from '@nestjs/common';
import { ShareService } from './share.service';
import { UploadsController } from './uploads.controller';

@Module({
  controllers: [UploadsController],
  providers: [ShareService],
  exports: [ShareService],
})
export class ShareModule {}
