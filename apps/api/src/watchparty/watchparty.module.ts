import { Module } from '@nestjs/common';
import { WatchPartyController } from './watchparty.controller';
import { WatchPartyService } from './watchparty.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [WatchPartyController],
  providers: [WatchPartyService],
})
export class WatchPartyModule {}
