import { Module } from '@nestjs/common';
import { PatreonController, PatreonGateController } from './patreon.controller';
import { PatreonService } from './patreon.service';

@Module({
  controllers: [PatreonController, PatreonGateController],
  providers: [PatreonService],
})
export class PatreonModule {}
