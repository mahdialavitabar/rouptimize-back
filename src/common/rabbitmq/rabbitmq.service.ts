import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Channel, ConsumeMessage, Options, connect } from 'amqplib';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import * as schema from '../../db/schema';
import { DB_POOL } from '../database/database.tokens';
import { setLocalRlsRole } from '../database/rls-role';
import {
  RequestContextService,
  type RequestContextData,
} from '../request-context/request-context.service';

type ConsumeHandler = (message: ConsumeMessage) => Promise<void> | void;

export type TenantMessageEnvelope<T> = {
  requestContext: RequestContextData;
  payload: T;
};

@Injectable()
export class RabbitmqService implements OnModuleDestroy {
  private readonly logger = new Logger(RabbitmqService.name);
  private connection?: Awaited<ReturnType<typeof connect>>;
  private channel?: Channel;
  private connectPromise?: Promise<void>;
  private readonly uri: string;
  private readonly prefetch: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly requestContext: RequestContextService,
    @Inject(DB_POOL)
    private readonly pool: Pool,
  ) {
    this.uri =
      this.configService.get<string>('RABBITMQ_URI', { infer: true }) ||
      'amqp://guest:guest@rabbitmq:5672';
    this.prefetch = Number(
      this.configService.get<number>('RABBITMQ_PREFETCH', { infer: true }) ||
        10,
    );
  }

  private async ensureChannel(): Promise<void> {
    if (this.channel) {
      return;
    }

    if (!this.connectPromise) {
      this.connectPromise = this.createChannel();
    }

    await this.connectPromise;
  }

  private resetConnectionState(): void {
    this.connection = undefined;
    this.channel = undefined;
    this.connectPromise = undefined;
  }

  private attachConnectionHandlers(): void {
    if (!this.connection) {
      return;
    }
    this.connection.on('close', () => this.resetConnectionState());
    this.connection.on('error', () => this.resetConnectionState());
  }

  private async createChannel(): Promise<void> {
    try {
      const connection = await connect(this.uri);
      this.connection = connection;
      this.attachConnectionHandlers();
      const channel = await connection.createChannel();
      this.channel = channel;
      if (this.prefetch) {
        await channel.prefetch(this.prefetch);
      }
    } catch (error) {
      this.resetConnectionState();
      throw error;
    }
  }

  async getChannel(): Promise<Channel> {
    await this.ensureChannel();
    if (!this.channel) {
      throw new Error('Channel not created');
    }
    return this.channel;
  }

  async assertExchange(
    name: string,
    type: string,
    options?: Options.AssertExchange,
  ): Promise<void> {
    const channel = await this.getChannel();
    await channel.assertExchange(name, type, {
      durable: true,
      ...(options || {}),
    });
  }

  async assertQueue(
    name: string,
    options?: Options.AssertQueue,
  ): Promise<void> {
    const channel = await this.getChannel();
    await channel.assertQueue(name, { durable: true, ...(options || {}) });
  }

  async publish(
    exchange: string,
    routingKey: string,
    message: unknown,
    options?: Options.Publish,
  ): Promise<boolean> {
    const channel = await this.getChannel();
    const payload = Buffer.isBuffer(message)
      ? message
      : Buffer.from(
          typeof message === 'string' ? message : JSON.stringify(message),
        );
    await channel.assertExchange(exchange, 'topic', { durable: true });
    return channel.publish(exchange, routingKey, payload, options);
  }

  async publishTenant<T>(
    exchange: string,
    routingKey: string,
    payload: T,
    options?: Options.Publish,
  ): Promise<boolean> {
    const requestContext = this.requestContext.snapshot();
    if (!requestContext.isSuperAdmin && !requestContext.companyId) {
      throw new Error('Company context not available');
    }

    const message: TenantMessageEnvelope<T> = {
      requestContext,
      payload,
    };

    return this.publish(exchange, routingKey, message, options);
  }

  async consume(
    queue: string,
    handler: ConsumeHandler,
    options?: { queue?: Options.AssertQueue; consume?: Options.Consume },
  ): Promise<void> {
    const channel = await this.getChannel();
    await channel.assertQueue(queue, {
      durable: true,
      ...(options?.queue || {}),
    });
    await channel.consume(
      queue,
      async (message: ConsumeMessage | null) => {
        if (!message) {
          return;
        }
        try {
          await handler(message);
          channel.ack(message);
        } catch (error) {
          this.logger.error(this.formatError(error));
          channel.nack(message, false, false);
        }
      },
      options?.consume,
    );
  }

  async consumeTenant<T>(
    queue: string,
    handler: (payload: T, message: ConsumeMessage) => Promise<void> | void,
    options?: { queue?: Options.AssertQueue; consume?: Options.Consume },
  ): Promise<void> {
    return this.consume(
      queue,
      async (message) => {
        const parsed = JSON.parse(message.content.toString()) as
          | TenantMessageEnvelope<T>
          | undefined;

        if (!parsed?.requestContext) {
          throw new Error('Tenant message missing requestContext');
        }

        const ctx = parsed.requestContext;
        const shouldUseTransaction = Boolean(ctx.isSuperAdmin || ctx.companyId);

        if (!shouldUseTransaction) {
          await this.requestContext.run(ctx, () =>
            Promise.resolve(handler(parsed.payload, message)),
          );
          return;
        }

        const client = await this.pool.connect();
        try {
          await client.query('BEGIN');
          await setLocalRlsRole(client);

          if (ctx.isSuperAdmin) {
            await client.query("SET LOCAL app.is_superadmin = 'true'");
          } else if (ctx.companyId) {
            await client.query(
              "SELECT set_config('app.current_company_id', $1::text, true)",
              [ctx.companyId],
            );
          }

          const db = drizzle(client, { schema });

          await this.requestContext.run(
            {
              ...ctx,
              pgClient: client,
              db,
            },
            () => Promise.resolve(handler(parsed.payload, message)),
          );

          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      },
      options,
    );
  }

  private formatError(error: unknown): string {
    if (error instanceof Error) {
      return error.stack || error.message;
    }
    return String(error);
  }

  async close(): Promise<void> {
    if (this.channel) {
      await this.channel.close();
    }
    if (this.connection) {
      await this.connection.close();
    }
    this.resetConnectionState();
  }

  async onModuleDestroy(): Promise<void> {
    await this.close();
  }
}
