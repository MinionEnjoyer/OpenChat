import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ShareModule } from '../share/share.service';
import { MediaController } from './media.controller';

@Module({
  imports: [AuthModule, ShareModule],
  controllers: [MediaController],
})
export class MediaModule {}
