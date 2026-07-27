import { Module } from '@nestjs/common';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';
import { AuthModule } from '../auth/auth.module';
import { ServersModule } from '../servers/servers.module';

// PrismaModule + RedisModule are @Global. AuthModule provides SessionGuard.
// MessagesService is exported so the realtime gateway can reuse it.
@Module({
  imports: [AuthModule, ServersModule],
  controllers: [MessagesController],
  providers: [MessagesService],
  exports: [MessagesService],
})
export class MessagesModule {}
