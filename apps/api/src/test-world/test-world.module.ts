import { Module } from '@nestjs/common';
import { TestWorldService } from './test-world.service';
import { TestWorldController } from './test-world.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [TestWorldController],
  providers: [TestWorldService],
})
export class TestWorldModule {}
