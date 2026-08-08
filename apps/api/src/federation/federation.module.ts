import { Global, Module } from '@nestjs/common';
import { FederationController } from './federation.controller';
import { FederationService } from './federation.service';

@Global()
@Module({
  controllers: [FederationController],
  providers: [FederationService],
  exports: [FederationService],
})
export class FederationModule {}
