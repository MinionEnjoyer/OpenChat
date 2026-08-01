import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;
  private subscriber: Redis;

  constructor(private configService: ConfigService) {
    const redisUrl = this.configService.get<string>('REDIS_URL');
    
    if (!redisUrl) {
      throw new Error('REDIS_URL environment variable is not set');
    }

    // Primary client for commands (get, set, del, etc.)
    this.client = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 3) return null;
        return Math.min(times * 200, 1000);
      },
    });

    // Dedicated subscriber client for pub/sub
    this.subscriber = new Redis(redisUrl, {
      // A subscription may be queued during application bootstrap. Ioredis' default
      // ready check sends INFO, which Redis rejects once that queued SUBSCRIBE has
      // already put the connection into subscriber mode.
      enableReadyCheck: false,
      maxRetriesPerRequest: null, // Pub/Sub connections shouldn't retry requests automatically in the same way
      retryStrategy: (times) => {
        if (times > 3) return null;
        return Math.min(times * 200, 1000);
      },
    });

    this.client.on('error', (err) => this.logger.error('Redis Client Error:', err));
    this.subscriber.on('error', (err) => this.logger.error('Redis Subscriber Error:', err));
  }

  getClient(): Redis {
    return this.client;
  }

  getSubscriber(): Redis {
    return this.subscriber;
  }

  async publish(channel: string, payload: any): Promise<void> {
    const serializedPayload = JSON.stringify(payload);
    await this.client.publish(channel, serializedPayload);
  }

  async setEx(key: string, value: string, ttlSeconds: number): Promise<string | null> {
    return this.client.setex(key, ttlSeconds, value);
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async del(key: string): Promise<number> {
    return this.client.del(key);
  }

  async onModuleDestroy() {
    await this.client.quit();
    await this.subscriber.quit();
  }
}
