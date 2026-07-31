import { AuditLogService } from './audit-log.service';

describe('AuditLogService', () => {
  it('does not query every server role when the owner reads the log', async () => {
    const createdAt = new Date('2026-07-31T12:00:00Z');
    const prisma = {
      server: { findUnique: jest.fn().mockResolvedValue({ ownerId: 'owner-1' }) },
      serverMember: { findUnique: jest.fn().mockResolvedValue({ roles: [] }) },
      role: { findMany: jest.fn() },
      auditLog: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'audit-1',
            serverId: 'server-1',
            actor: {
              id: 'owner-1',
              username: 'owner',
              displayName: 'Owner',
              avatarUrl: null,
            },
            action: 'SERVER_UPDATE',
            targetType: 'server',
            targetId: 'server-1',
            metadata: null,
            createdAt,
          },
        ]),
      },
    };
    const service = new AuditLogService(prisma as any);

    const result = await service.read('server-1', 'owner-1');

    expect(prisma.role.findMany).not.toHaveBeenCalled();
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 50 }));
    expect(result.entries[0].createdAt).toBe(createdAt.toISOString());
  });
});
