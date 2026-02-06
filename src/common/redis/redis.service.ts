import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType } from 'redis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client?: RedisClientType;
  private connectPromise?: Promise<RedisClientType>;

  constructor(private readonly configService: ConfigService) {}

  async getClient(): Promise<RedisClientType> {
    if (this.client) {
      return this.client;
    }

    if (!this.connectPromise) {
      this.connectPromise = this.createClient();
    }

    this.client = await this.connectPromise;
    return this.client;
  }

  private async createClient(): Promise<RedisClientType> {
    const host =
      this.configService.get<string>('REDIS_HOST', { infer: true }) || 'redis';
    const port = Number(
      this.configService.get<number>('REDIS_PORT', { infer: true }) || 6379,
    );
    const password = this.configService.get<string>('REDIS_PASSWORD', {
      infer: true,
    });

    try {
      const client = createClient({
        socket: {
          host,
          port,
        },
        password: password || undefined,
      });
      client.on('error', (err: unknown) =>
        this.logger.error(this.formatError(err)),
      );
      await client.connect();
      this.logger.log(`Redis connected at ${host}:${port}`);
      return client as unknown as RedisClientType;
    } catch (error) {
      this.connectPromise = undefined;
      throw error;
    }
  }

  private formatError(error: unknown): string {
    if (error instanceof Error) {
      return error.stack || error.message;
    }
    return String(error);
  }

  async disconnect(): Promise<void> {
    if (!this.client) {
      return;
    }

    await this.client.quit();
    this.client = undefined;
    this.connectPromise = undefined;
  }

  async onModuleDestroy(): Promise<void> {
    await this.disconnect();
  }
}
