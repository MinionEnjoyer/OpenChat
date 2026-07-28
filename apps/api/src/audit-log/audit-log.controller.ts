import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AuditLogService } from './audit-log.service';
import type { User } from '@prisma/client';

const AuditLogQuery = z.object({
  before: z.string().uuid().optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
  action: z.string().optional(),
  actorId: z.string().uuid().optional(),
});

@Controller('servers')
@UseGuards(AuthGuard)
export class AuditLogController {
  constructor(private readonly auditLog: AuditLogService) {}

  @Get(':id/audit-log')
  list(
    @Param('id') serverId: string,
    @CurrentUser() user: User,
    @Query(new ZodValidationPipe(AuditLogQuery))
    query: { before?: string; limit?: number; action?: string; actorId?: string },
  ) {
    return this.auditLog.read(serverId, user.id, query);
  }
}
