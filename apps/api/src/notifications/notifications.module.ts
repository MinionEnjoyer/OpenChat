import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { AuthModule } from '../auth/auth.module';
import { ServersModule } from '../servers/servers.module';
import { FriendsModule } from '../friends/friends.module';

@Module({
  imports: [AuthModule, ServersModule, FriendsModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
})
export class NotificationsModule {}
