import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ShareModule } from '../share/share.module';
import { UploadsController } from './uploads.controller';

@Module({
  imports: [AuthModule, ShareModule],
  controllers: [UploadsController],
})
export class UploadsModule {}
