import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);
  private readonly redis: Redis;
  private readonly TTL_SECONDS = 86400; // 24h

  constructor(private readonly config: ConfigService) {
    this.redis = new Redis({
      host: this.config.get<string>('REDIS_HOST', 'localhost'),
      port: this.config.get<number>('REDIS_PORT', 6379),
    });
  }

  async isDuplicate(externalMessageId: string, channelId: string): Promise<boolean> {
    const key = `idemp:${channelId}:${externalMessageId}`;
    const exists = await this.redis.exists(key);
    return exists === 1;
  }

  async markProcessed(externalMessageId: string, channelId: string): Promise<void> {
    const key = `idemp:${channelId}:${externalMessageId}`;
    await this.redis.setex(key, this.TTL_SECONDS, '1');
  }
}
