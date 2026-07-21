import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { ServersModule } from './servers/servers.module';
import { MessagesModule } from './messages/messages.module';
import { RealtimeModule } from './realtime/realtime.module';
import { ShareModule } from './share/share.module';
import { InvitesModule } from './invites/invites.module';
import { FriendsModule } from './friends/friends.module';
import { DmsModule } from './dms/dms.module';
import { NotificationsModule } from './notifications/notifications.module';
import { VoiceModule } from './voice/voice.module';
import { WatchPartyModule } from './watchparty/watchparty.module';
import { GifsModule } from './gifs/gifs.module';
import { HealthController } from './health/health.controller';
import { ConfigController } from './config/config.controller';
import { validateEnv } from './config/configuration';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate: validateEnv,
    }),
    LoggerModule.forRoot(),
    PrismaModule,
    RedisModule,
    AuthModule,
    ServersModule,
    MessagesModule,
    RealtimeModule,
    ShareModule,
    InvitesModule,
    FriendsModule,
    DmsModule,
    NotificationsModule,
    VoiceModule,
    WatchPartyModule,
    GifsModule,
  ],
  controllers: [HealthController, ConfigController],
})
export class AppModule {}
