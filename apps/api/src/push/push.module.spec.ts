/**
 * Guard: PushModule must boot when FCM_SERVICE_ACCOUNT is unset.
 *
 * The old FcmPushTransport constructor threw, killing the entire API.
 * This spec proves the fix: absent → NoopPushTransport, present → FcmPushTransport.
 */
import { Test, type TestingModule } from '@nestjs/testing';
import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PushModule } from './push.module';
import { PushDispatchService } from './push-dispatch.service';
import { PUSH_TRANSPORT } from './push-transport.interface';
import { NoopPushTransport } from './noop-push.transport';
import { FcmPushTransport } from './fcm-push.transport';
import { RedisService } from '../redis/redis.service';
import { PrismaService } from '../prisma/prisma.service';

const mockRedis = {
  getSubscriber: () => ({
    subscribe: jest.fn().mockResolvedValue(undefined),
    unsubscribe: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
  }),
};

const mockPrisma = {
  deviceToken: {
    findMany: jest.fn(),
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  channel: { findUnique: jest.fn() },
  notificationSetting: { findUnique: jest.fn() },
};

/** Global mock for deps PushDispatchService needs but PushModule doesn't import. */
@Global()
@Module({
  providers: [
    { provide: RedisService, useValue: mockRedis },
    { provide: PrismaService, useValue: mockPrisma },
    { provide: ConfigService, useValue: { get: () => undefined } },
  ],
  exports: [RedisService, PrismaService, ConfigService],
})
class TestInfraModule {}

describe('PushModule — FCM_SERVICE_ACCOUNT absent', () => {
  let module: TestingModule;

  afterEach(async () => {
    if (module) await module.close();
  });

  // ── Test 1: Module boots successfully with no FCM_SERVICE_ACCOUNT ──
  it('boots the Nest context when FCM_SERVICE_ACCOUNT is unset', async () => {
    module = await Test.createTestingModule({
      imports: [TestInfraModule, PushModule],
    })
      .overrideProvider(ConfigService)
      .useValue({ get: () => undefined })
      .compile();

    // If we reach here without throw, the module booted.
    expect(module).toBeDefined();

    // Resolving PushDispatchService must succeed
    const svc = module.get(PushDispatchService);
    expect(svc).toBeDefined();

    // The resolved transport must be NoopPushTransport
    const transport = module.get(PUSH_TRANSPORT);
    expect(transport).toBeInstanceOf(NoopPushTransport);
  });

  // ── Test 2: sendPush is a no-op and does not throw ──
  it('sendPush with no credentials is a no-op', async () => {
    module = await Test.createTestingModule({
      imports: [TestInfraModule, PushModule],
    })
      .overrideProvider(ConfigService)
      .useValue({ get: () => undefined })
      .compile();

    const transport = module.get<NoopPushTransport>(PUSH_TRANSPORT);
    const result = await transport.sendPush(['token1', 'token2'], {
      title: 'Test',
      body: 'test body',
    });

    expect(result.success).toBe(0);
    expect(result.invalidTokens).toEqual([]);
  });
});

describe('PushModule — FCM_SERVICE_ACCOUNT present', () => {
  let module: TestingModule;

  const validServiceAccount = JSON.stringify({
    type: 'service_account',
    project_id: 'test-project',
    private_key_id: 'key123',
    private_key:
      '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC\n-----END PRIVATE KEY-----\n',
    client_email: 'test@test-project.iam.gserviceaccount.com',
    client_id: '12345',
    auth_uri: 'https://accounts.google.com/o/oauth2/auth',
    token_uri: 'https://oauth2.googleapis.com/token',
  });

  afterEach(async () => {
    if (module) await module.close();
  });

  // ── Test 3: FcmPushTransport is constructed and selected ──
  it('selects FcmPushTransport when FCM_SERVICE_ACCOUNT is valid', async () => {
    module = await Test.createTestingModule({
      imports: [TestInfraModule, PushModule],
    })
      .overrideProvider(ConfigService)
      .useValue({
        get: (key: string) =>
          key === 'FCM_SERVICE_ACCOUNT' ? validServiceAccount : undefined,
      })
      .compile();

    const transport = module.get(PUSH_TRANSPORT);
    expect(transport).toBeInstanceOf(FcmPushTransport);

    // The FcmPushTransport instance should have its projectId set
    expect((transport as any).projectId).toBe('test-project');
  });

  // ── Test: malformed JSON still throws (operator error) ──
  it('throws when FCM_SERVICE_ACCOUNT is invalid JSON', async () => {
    await expect(
      Test.createTestingModule({
        imports: [TestInfraModule, PushModule],
      })
        .overrideProvider(ConfigService)
        .useValue({ get: () => 'not-valid-json' })
        .compile(),
    ).rejects.toThrow(/not valid JSON/);
  });
});
