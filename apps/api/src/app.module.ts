import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { ServersModule } from './servers/servers.module';
import { MessagesModule } from './messages/messages.module';
import { RealtimeModule } from './realtime/realtime.module';
import { PresenceModule } from './realtime/presence.module';
import { ShareModule } from './share/share.module';
import { InvitesModule } from './invites/invites.module';
import { FriendsModule } from './friends/friends.module';
import { DmsModule } from './dms/dms.module';
import { NotificationsModule } from './notifications/notifications.module';
import { VoiceModule } from './voice/voice.module';
import { WatchPartyModule } from './watchparty/watchparty.module';
import { GifsModule } from './gifs/gifs.module';
import { AuditLogModule } from './audit-log/audit-log.module';
import { UploadsModule } from './uploads/uploads.module';
import { MediaModule } from './media/media.module';
import { PushModule } from './push/push.module';
import { BotsModule } from './bots/bots.module';
import { TestWorldModule } from './test-world/test-world.module';
import { HealthController } from './health/health.controller';
import { ConfigController } from './config/config.controller';
import { validateEnv } from './config/configuration';
import { FederationModule } from './federation/federation.module';

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
    FederationModule,
    PresenceModule,
    AuthModule,
    AuditLogModule,
    ServersModule,
    MessagesModule,
    RealtimeModule,
    ShareModule,
    BotsModule,
    InvitesModule,
    FriendsModule,
    DmsModule,
    NotificationsModule,
    VoiceModule,
    WatchPartyModule,
    GifsModule,
    UploadsModule,
    MediaModule,
    PushModule,
    TestWorldModule,
  ],
  controllers: [HealthController, ConfigController],
})
export class AppModule {}
