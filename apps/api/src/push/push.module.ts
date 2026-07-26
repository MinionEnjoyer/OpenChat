/**
 * Push module — provides PushDispatchService with injectable transport.
 *
 * In production: FcmPushTransport (fails loudly without FCM_SERVICE_ACCOUNT).
 * In tests: MockPushTransport is injected directly via custom provider override.
 *
 * @satisfies FR-NOTIF-001
 * @satisfies FR-NOTIF-003
 */
import { Module } from '@nestjs/common';
import { PushDispatchService } from './push-dispatch.service';
import { FcmPushTransport } from './fcm-push.transport';
import { PUSH_TRANSPORT } from './push-transport.interface';

@Module({
  providers: [
    PushDispatchService,
    FcmPushTransport,
    {
      provide: PUSH_TRANSPORT,
      useExisting: FcmPushTransport,
    },
  ],
  exports: [PushDispatchService],
})
export class PushModule {}
