import type { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { TelemetryService, HEARTBEAT_INTERVAL_MS } from './telemetry.service';

describe('TelemetryService', () => {
  const installId = '6b507574-f7ce-4f4f-8897-9244eb8b0090';

  function makeService(overrides: Record<string, string> = {}) {
    const prisma = {
      deploymentIdentity: {
        upsert: jest.fn().mockResolvedValue({ key: 'primary', installId }),
      },
      telemetryInstallation: {
        upsert: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const values: Record<string, string> = {
      OPENCHAT_VERSION: '0.8.47',
      OPENCHAT_DEPLOYMENT_TYPE: 'docker-compose',
      TELEMETRY_ADMIN_TOKEN: 'a'.repeat(32),
      ...overrides,
    };
    const config = { get: jest.fn((key: string) => values[key]) } as unknown as ConfigService;
    return { service: new TelemetryService(prisma as never, config), prisma };
  }

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('sends only install ID, version, deployment type, and product', async () => {
    const { service, prisma } = makeService();
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 202 }));

    await service.sendHeartbeat();

    expect(prisma.deploymentIdentity.upsert).toHaveBeenCalledWith({
      where: { key: 'primary' },
      create: { key: 'primary', installId: expect.any(String) },
      update: {},
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, request] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(request?.body))).toEqual({
      product: 'openchat',
      installId,
      version: '0.8.47',
      deploymentType: 'docker-compose',
    });
  });

  it('sends immediately and repeats every 24 hours', async () => {
    jest.useFakeTimers();
    const { service } = makeService();
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 202 }));

    service.onModuleInit();
    await jest.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS - 1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(HEARTBEAT_INTERVAL_MS).toBe(24 * 60 * 60 * 1000);

    service.onModuleDestroy();
  });

  it('keeps telemetry failures nonfatal', async () => {
    const { service, prisma } = makeService();
    prisma.deploymentIdentity.upsert.mockRejectedValue(new Error('database unavailable'));

    await expect(service.sendHeartbeat()).resolves.toBe(false);
  });

  it('keeps collector network and HTTP failures nonfatal', async () => {
    const { service } = makeService();
    const fetchMock = jest.spyOn(global, 'fetch');
    fetchMock.mockRejectedValueOnce(new Error('collector unavailable'));
    await expect(service.sendHeartbeat()).resolves.toBe(false);

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
    await expect(service.sendHeartbeat()).resolves.toBe(false);
  });

  it('continues the 24-hour schedule after a failed heartbeat', async () => {
    jest.useFakeTimers();
    const { service } = makeService();
    const fetchMock = jest.spyOn(global, 'fetch')
      .mockRejectedValueOnce(new Error('first attempt failed'))
      .mockResolvedValue(new Response(null, { status: 202 }));

    service.onModuleInit();
    await jest.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    service.onModuleDestroy();
  });

  it('upserts collector records without request metadata', async () => {
    const { service, prisma } = makeService();
    const payload = {
      product: 'openshare' as const,
      installId,
      version: '0.2.36',
      deploymentType: 'docker-compose',
    };

    await service.record(payload, new Date('2026-08-09T20:00:00Z'));

    expect(prisma.telemetryInstallation.upsert).toHaveBeenCalledWith({
      where: { product_installId: { product: 'openshare', installId } },
      create: {
        ...payload,
        firstSeenAt: new Date('2026-08-09T20:00:00Z'),
        lastSeenAt: new Date('2026-08-09T20:00:00Z'),
      },
      update: {
        version: '0.2.36',
        deploymentType: 'docker-compose',
        lastSeenAt: new Date('2026-08-09T20:00:00Z'),
        heartbeatCount: { increment: 1 },
      },
    });
  });

  it('reports seven-day and thirty-day active installation totals', async () => {
    const { service, prisma } = makeService();
    prisma.telemetryInstallation.findMany.mockResolvedValue([
      { product: 'openchat', deploymentType: 'docker-compose', lastSeenAt: new Date('2026-08-09T00:00:00Z') },
      { product: 'openshare', deploymentType: 'kubernetes', lastSeenAt: new Date('2026-08-01T00:00:00Z') },
      { product: 'openchat', deploymentType: 'source', lastSeenAt: new Date('2026-06-01T00:00:00Z') },
      { product: 'openchat', deploymentType: 'ci', lastSeenAt: new Date('2026-08-09T00:00:00Z') },
    ]);

    const report = await service.summary('a'.repeat(32), new Date('2026-08-10T00:00:00Z'));

    expect(report.installations).toEqual({
      allTime: {
        total: 3, openchat: 2, openshare: 1,
        deploymentTypes: { 'docker-compose': 1, kubernetes: 1, source: 1 },
      },
      active7d: {
        total: 1, openchat: 1, openshare: 0,
        deploymentTypes: { 'docker-compose': 1 },
      },
      active30d: {
        total: 2, openchat: 1, openshare: 1,
        deploymentTypes: { 'docker-compose': 1, kubernetes: 1 },
      },
    });
    expect(report.excludedNonDeployments).toBe(1);
  });

  it('includes exact activity-window boundaries and excludes one millisecond older rows', async () => {
    const { service, prisma } = makeService();
    const now = new Date('2026-08-10T00:00:00.000Z');
    prisma.telemetryInstallation.findMany.mockResolvedValue([
      { product: 'openchat', deploymentType: 'docker-compose', lastSeenAt: new Date('2026-08-03T00:00:00.000Z') },
      { product: 'openshare', deploymentType: 'source', lastSeenAt: new Date('2026-08-02T23:59:59.999Z') },
      { product: 'openshare', deploymentType: 'kubernetes', lastSeenAt: new Date('2026-07-11T00:00:00.000Z') },
      { product: 'openchat', deploymentType: 'source', lastSeenAt: new Date('2026-07-10T23:59:59.999Z') },
    ]);

    const report = await service.summary('a'.repeat(32), now);

    expect(report.installations.active7d).toEqual({
      total: 1,
      openchat: 1,
      openshare: 0,
      deploymentTypes: { 'docker-compose': 1 },
    });
    expect(report.installations.active30d).toEqual({
      total: 3,
      openchat: 1,
      openshare: 2,
      deploymentTypes: { 'docker-compose': 1, source: 1, kubernetes: 1 },
    });
  });

  it('protects aggregate telemetry with the configured admin token', async () => {
    const { service } = makeService();
    await expect(service.summary('wrong-token')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
