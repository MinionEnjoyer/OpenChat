import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID, timingSafeEqual } from 'crypto';
import apiPackage from '../../package.json';
import { PrismaService } from '../prisma/prisma.service';
import {
  HEARTBEAT_INTERVAL_MS,
  TELEMETRY_COLLECTOR_URL,
  TelemetryHeartbeat,
} from './telemetry.types';

export { HEARTBEAT_INTERVAL_MS } from './telemetry.types';

type InstallationRow = {
  product: 'openchat' | 'openshare';
  deploymentType: string;
  lastSeenAt: Date;
};

type InstallationCount = {
  total: number;
  openchat: number;
  openshare: number;
  deploymentTypes: Record<string, number>;
};

const NON_DEPLOYMENT_TYPES = new Set(['ci', 'test', 'development']);

@Injectable()
export class TelemetryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelemetryService.name);
  private readonly endpoint: string;
  private readonly version: string;
  private readonly deploymentType: string;
  private readonly adminToken: string;
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.endpoint = config.get<string>('DEPLOYMENT_HEARTBEAT_ENDPOINT') ?? TELEMETRY_COLLECTOR_URL;
    this.version = config.get<string>('OPENCHAT_VERSION') ?? apiPackage.version;
    this.deploymentType = config.get<string>('OPENCHAT_DEPLOYMENT_TYPE') ?? 'docker-compose';
    this.adminToken = config.get<string>('TELEMETRY_ADMIN_TOKEN') ?? '';
  }

  onModuleInit(): void {
    this.schedule(0);
  }

  onModuleDestroy(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private schedule(delay: number): void {
    this.timer = setTimeout(() => void this.tick(), delay);
    this.timer.unref();
  }

  private async tick(): Promise<void> {
    try {
      await this.sendHeartbeat();
    } finally {
      this.schedule(HEARTBEAT_INTERVAL_MS);
    }
  }

  async sendHeartbeat(): Promise<boolean> {
    try {
      const store = this.prisma as any;
      const identity = await store.deploymentIdentity.upsert({
        where: { key: 'primary' },
        create: { key: 'primary', installId: randomUUID() },
        update: {},
      });
      const payload: TelemetryHeartbeat = {
        product: 'openchat',
        installId: identity.installId,
        version: this.version,
        deploymentType: this.deploymentType,
      };
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'user-agent': `OpenChat/${this.version} deployment-heartbeat`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`collector returned HTTP ${response.status}`);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Deployment heartbeat failed: ${message}`);
      return false;
    }
  }

  async record(payload: TelemetryHeartbeat, now = new Date()): Promise<void> {
    const store = this.prisma as any;
    await store.telemetryInstallation.upsert({
      where: { product_installId: { product: payload.product, installId: payload.installId } },
      create: { ...payload, firstSeenAt: now, lastSeenAt: now },
      update: {
        version: payload.version,
        deploymentType: payload.deploymentType,
        lastSeenAt: now,
        heartbeatCount: { increment: 1 },
      },
    });
  }

  async summary(token: string, now = new Date()) {
    this.authorizeSummary(token);
    const store = this.prisma as any;
    const storedRows: InstallationRow[] =
      await store.telemetryInstallation.findMany({
        select: { product: true, deploymentType: true, lastSeenAt: true },
      });
    const rows = storedRows.filter((row) => !NON_DEPLOYMENT_TYPES.has(row.deploymentType));
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return {
      generatedAt: now.toISOString(),
      excludedNonDeployments: storedRows.length - rows.length,
      installations: {
        allTime: this.count(rows),
        active7d: this.count(rows.filter((row) => row.lastSeenAt >= sevenDaysAgo)),
        active30d: this.count(rows.filter((row) => row.lastSeenAt >= thirtyDaysAgo)),
      },
    };
  }

  private count(rows: InstallationRow[]): InstallationCount {
    const openchat = rows.filter((row) => row.product === 'openchat').length;
    const openshare = rows.filter((row) => row.product === 'openshare').length;
    const deploymentTypes = rows.reduce<Record<string, number>>((counts, row) => {
      counts[row.deploymentType] = (counts[row.deploymentType] ?? 0) + 1;
      return counts;
    }, {});
    return { total: rows.length, openchat, openshare, deploymentTypes };
  }

  private authorizeSummary(supplied: string): void {
    const expected = Buffer.from(this.adminToken);
    const candidate = Buffer.from(supplied ?? '');
    if (!expected.length || expected.length !== candidate.length || !timingSafeEqual(expected, candidate)) {
      throw new UnauthorizedException('Invalid telemetry admin token');
    }
  }
}
