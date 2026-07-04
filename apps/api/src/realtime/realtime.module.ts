import { Module } from '@nestjs/common';
import { EventsGateway } from './events.gateway';
import { AuthModule } from '../auth/auth.module';
import { MessagesModule } from '../messages/messages.module';

// PrismaModule + RedisModule are @Global. AuthModule provides AuthService;
// MessagesModule provides MessagesService.
@Module({
  imports: [AuthModule, MessagesModule],
  providers: [EventsGateway],
  exports: [EventsGateway],
})
export class RealtimeModule {}
