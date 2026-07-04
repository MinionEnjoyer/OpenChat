import { Module } from '@nestjs/common';
import { ServersController } from './servers.controller';
import { ServersService } from './servers.service';
import { AuthModule } from '../auth/auth.module';

// PrismaModule is @Global. AuthModule provides SessionGuard used by the controller.
@Module({
  imports: [AuthModule],
  controllers: [ServersController],
  providers: [ServersService],
  exports: [ServersService],
})
export class ServersModule {}
