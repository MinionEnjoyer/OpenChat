import { NotFoundException } from '@nestjs/common';
import { AuditLogController } from './audit-log/audit-log.controller';
import { ConfigController } from './config/config.controller';
import { DeviceTokensController } from './notifications/device-tokens.controller';
import { NotificationsController } from './notifications/notifications.controller';
import { DmsController } from './dms/dms.controller';
import { FederationController } from './federation/federation.controller';
import { HealthController } from './health/health.controller';
import { InvitesController } from './invites/invites.controller';
import { TestWorldController } from './test-world/test-world.controller';
import { VoiceController } from './voice/voice.controller';

function serviceMock() {
  const target: Record<string, jest.Mock> = {};
  return new Proxy(target, {
    get(obj, prop: string) {
      if (!obj[prop]) obj[prop] = jest.fn().mockResolvedValue({ ok: true });
      return obj[prop];
    },
  });
}

describe('Supplemental HTTP controller mapping', () => {
  const user = { id: 'user-1' } as any;

  it('maps direct-message and invite routes to authenticated service calls', async () => {
    const dms = serviceMock();
    const dmController = new DmsController(dms as any);
    await dmController.listDms(user);
    await dmController.openDm(user, { userId: 'friend-1' });
    expect(dms.openDm).toHaveBeenCalledWith('user-1', 'friend-1');

    const invites = serviceMock();
    const inviteController = new InvitesController(invites as any);
    await inviteController.createInvite('server-1', user, { maxUses: 5, expiresInHours: 24 });
    await inviteController.getInvite('CODE');
    await inviteController.acceptInvite('CODE', user);
    expect(invites.createInvite).toHaveBeenCalledWith('server-1', 'user-1', {
      maxUses: 5, expiresInHours: 24,
    });
  });

  it('maps voice and audit-log routes with channel/server scope', async () => {
    const voice = serviceMock();
    const voiceController = new VoiceController(voice as any);
    await Promise.all([
      voiceController.join('channel-1', user), voiceController.leave('channel-1', user),
      voiceController.participants('channel-1', user),
    ]);
    expect(voice.join).toHaveBeenCalledWith('channel-1', 'user-1');

    const audit = serviceMock();
    const auditController = new AuditLogController(audit as any);
    await auditController.list('server-1', user, { action: 'BAN', limit: 20 });
    expect(audit.read).toHaveBeenCalledWith('server-1', 'user-1', { action: 'BAN', limit: 20 });
  });

  it('maps notification aggregation, invitation actions, settings, and owned deletion', async () => {
    const notifications = serviceMock();
    notifications.deleteSetting.mockResolvedValue({ success: true });
    const servers = serviceMock();
    const controller = new NotificationsController(notifications as any, servers as any);
    await Promise.all([
      controller.get(user), controller.accept('invite-1', user), controller.decline('invite-1', user),
      controller.getSettings(user), controller.upsertSetting(user, {
        scope: 'CHANNEL', scopeId: 'channel-1', level: 'ALL',
      } as any), controller.deleteSetting(user, 'setting-1'),
    ]);
    expect(servers.acceptInvitation).toHaveBeenCalledWith('invite-1', 'user-1');
    notifications.deleteSetting.mockResolvedValue(null);
    await expect(controller.deleteSetting(user, 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('maps device registration/list/removal and ignores idempotent delete results', async () => {
    const devices = serviceMock();
    const controller = new DeviceTokensController(devices as any);
    await controller.register(user, { token: 'push-token', platform: 'ios' });
    await controller.list(user);
    await controller.remove(user, 'push-token');
    expect(devices.register).toHaveBeenCalledWith('user-1', 'push-token', 'ios');
    expect(devices.delete).toHaveBeenCalledWith('user-1', 'push-token');
  });

  it('maps signed federation status and inbound event headers exactly', async () => {
    const federation = serviceMock();
    const controller = new FederationController(federation as any);
    await controller.status();
    await controller.receive({ event: true }, 'node-1', 'timestamp', 'signature');
    expect(federation.receive).toHaveBeenCalledWith({ event: true }, {
      nodeId: 'node-1', timestamp: 'timestamp', signature: 'signature',
    });
  });

  it('reports healthy and independently degraded database/Redis states', async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([1]) } as any;
    const redis = { getClient: jest.fn(() => ({ ping: jest.fn().mockResolvedValue('PONG') })) } as any;
    const controller = new HealthController(prisma, redis);
    await expect(controller.check()).resolves.toEqual({ status: 'ok', db: 'up', redis: 'up' });
    prisma.$queryRaw.mockRejectedValue(new Error('db down'));
    await expect(controller.check()).resolves.toEqual({ status: 'degraded', db: 'down', redis: 'up' });
    prisma.$queryRaw.mockResolvedValue([1]);
    redis.getClient.mockReturnValue({ ping: jest.fn().mockRejectedValue(new Error('redis down')) });
    await expect(controller.check()).resolves.toEqual({ status: 'degraded', db: 'up', redis: 'down' });
  });

  it('exposes public config and keeps test-world provisioning dev-only', async () => {
    const configController = new ConfigController();
    expect(configController.getConfig()).toEqual(expect.objectContaining({
      shareBaseUrl: process.env.SHARE_BASE_URL,
      jellyfinUrl: process.env.JELLYFIN_URL,
    }));

    const world = serviceMock();
    const worldController = new TestWorldController(world as any);
    const priorNodeEnv = process.env.NODE_ENV;
    const priorDevAuth = process.env.DEV_AUTH;
    process.env.NODE_ENV = 'production';
    await expect(worldController.create('test')).rejects.toBeInstanceOf(NotFoundException);
    process.env.NODE_ENV = 'test';
    process.env.DEV_AUTH = '1';
    await worldController.create('test');
    expect(world.provision).toHaveBeenCalledWith('test');
    process.env.NODE_ENV = priorNodeEnv;
    process.env.DEV_AUTH = priorDevAuth;
  });
});
