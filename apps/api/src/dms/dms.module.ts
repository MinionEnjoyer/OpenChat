import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DmsService } from './dms.service';
import { DmsController } from './dms.controller';

@Module({
  imports: [AuthModule],
  controllers: [DmsController],
  providers: [DmsService],
})
export class DmsModule {}
