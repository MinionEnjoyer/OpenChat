import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PatreonController, PatreonGateController } from './patreon.controller';
import { PatreonService } from './patreon.service';

@Module({
  imports: [AuthModule],
  controllers: [PatreonController, PatreonGateController],
  providers: [PatreonService],
})
export class PatreonModule {}
