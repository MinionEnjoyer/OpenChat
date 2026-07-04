import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
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
      maxRetriesPerRequest: null, // Pub/Sub connections shouldn't retry requests automatically in the same way
      retryStrategy: (times) => {
        if (times > 3) return null;
        return Math.min(times * 200, 1000);
      },
    });

    this.client.on('error', (err) => console.error('Redis Client Error:', err));
    this.subscriber.on('error', (err) => console.error('Redis Subscriber Error:', err));
    this.subscriber.on('message', (channel, message) => {
      // Internal handling if needed, or let the Gateway subscribe to this emitter
      // For now, we expose the clients so the Gateway can handle subscription logic
    });
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

  onModuleDestroy() {
    this.client.quit();
    this.subscriber.quit();
  }
}
