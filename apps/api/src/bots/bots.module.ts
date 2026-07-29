import { Module } from '@nestjs/common';
import { BotsController, ServerBotsController } from './bots.controller';
import { BotsService } from './bots.service';
import { AuthModule } from '../auth/auth.module';
import { ServersModule } from '../servers/servers.module';

// PrismaModule is @Global. AuthModule provides AuthService (bot tokens) + AuthGuard;
// ServersModule provides ServersService (permission checks for add-to-server).
@Module({
  imports: [AuthModule, ServersModule],
  controllers: [BotsController, ServerBotsController],
  providers: [BotsService],
})
export class BotsModule {}
