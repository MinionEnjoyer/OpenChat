import { Global, Module } from '@nestjs/common';
import { PresenceService } from './presence.service';

// Global so the gateway, MessagesService (@here), and any future consumer can
// inject the live presence registry without import wiring.
@Global()
@Module({
  providers: [PresenceService],
  exports: [PresenceService],
})
export class PresenceModule {}
