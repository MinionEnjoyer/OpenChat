import { BadRequestException } from '@nestjs/common';
import { TelemetryController } from './telemetry.controller';

describe('TelemetryController', () => {
  it('accepts the shared OpenChat/OpenShare heartbeat contract', async () => {
    const service = { record: jest.fn().mockResolvedValue(undefined) };
    const controller = new TelemetryController(service as never);
    const payload = {
      product: 'openshare',
      installId: '6b507574-f7ce-4f4f-8897-9244eb8b0090',
      version: '0.2.36',
      deploymentType: 'docker-compose',
    };

    await expect(controller.heartbeat(payload)).resolves.toEqual({ accepted: true });
    expect(service.record).toHaveBeenCalledWith(payload);
  });

  it('rejects extra or malformed fields', async () => {
    const controller = new TelemetryController({ record: jest.fn() } as never);

    await expect(controller.heartbeat({
      product: 'openshare',
      installId: 'not-a-uuid',
      version: '0.2.36',
      deploymentType: 'docker-compose',
      hostname: 'private-host',
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([
    ['unknown product', { product: 'other' }],
    ['non-semantic version', { version: 'latest' }],
    ['unsafe deployment type', { deploymentType: 'Docker Compose' }],
    ['overlong deployment type', { deploymentType: `a${'b'.repeat(64)}` }],
  ])('rejects %s', async (_label, change) => {
    const service = { record: jest.fn() };
    const controller = new TelemetryController(service as never);
    const payload = {
      product: 'openchat',
      installId: '6b507574-f7ce-4f4f-8897-9244eb8b0090',
      version: '0.8.46',
      deploymentType: 'docker-compose',
      ...change,
    };

    await expect(controller.heartbeat(payload)).rejects.toBeInstanceOf(BadRequestException);
    expect(service.record).not.toHaveBeenCalled();
  });

  it('passes only the supplied admin token to the aggregate summary service', async () => {
    const service = {
      record: jest.fn(),
      summary: jest.fn().mockResolvedValue({ installations: {} }),
    };
    const controller = new TelemetryController(service as never);

    await expect(controller.summary('private-admin-token')).resolves.toEqual({ installations: {} });
    expect(service.summary).toHaveBeenCalledWith('private-admin-token');
  });
});
