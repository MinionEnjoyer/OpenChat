/**
 * Push module — provides PushDispatchService with injectable transport.
 *
 * When FCM_SERVICE_ACCOUNT is set: FcmPushTransport (live FCM HTTP v1).
 * When FCM_SERVICE_ACCOUNT is absent: NoopPushTransport (graceful degrade).
 * In tests: MockPushTransport is injected directly via custom provider override.
 *
 * @satisfies FR-NOTIF-001
 * @satisfies FR-NOTIF-003
 */
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PushDispatchService } from './push-dispatch.service';
import { FcmPushTransport } from './fcm-push.transport';
import { NoopPushTransport } from './noop-push.transport';
import { PUSH_TRANSPORT } from './push-transport.interface';

@Module({
  providers: [
    PushDispatchService,
    FcmPushTransport,
    NoopPushTransport,
    {
      provide: PUSH_TRANSPORT,
      useFactory: (
        config: ConfigService,
        fcm: FcmPushTransport,
        noop: NoopPushTransport,
      ) => {
        const raw = config.get<string>('FCM_SERVICE_ACCOUNT');
        // If raw is truthy, FcmPushTransport's constructor would have already
        // thrown on malformed JSON — reaching here means config is valid.
        if (!raw) return noop;
        return fcm;
      },
      inject: [ConfigService, FcmPushTransport, NoopPushTransport],
    },
  ],
  exports: [PushDispatchService],
})
export class PushModule {}
