import { Module, forwardRef } from '@nestjs/common';
import { ServersController } from './servers.controller';
import { ServersService } from './servers.service';
import { OverwritesService } from '../overwrites/overwrites.service';
import { AuthModule } from '../auth/auth.module';
import { AuditLogModule } from '../audit-log/audit-log.module';

// PrismaModule is @Global. AuthModule provides SessionGuard used by the controller.
@Module({
  imports: [AuthModule, AuditLogModule],
  controllers: [ServersController],
  providers: [ServersService, OverwritesService],
  exports: [ServersService],
})
export class ServersModule {}