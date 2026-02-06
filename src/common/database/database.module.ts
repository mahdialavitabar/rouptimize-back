import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, types } from 'pg';
import * as schema from '../../db/schema';
import { DB_POOL, DRIZZLE_DB } from './database.tokens';

function patchPgParsers(): void {
  types.setTypeParser(1114, (value) => {
    if (value === null) {
      return null;
    }
    return new Date(`${value}Z`);
  });
}

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: DB_POOL,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        patchPgParsers();

        return new Pool({
          host: configService.get<string>('DB_HOST', { infer: true }),
          port: configService.get<number>('DB_PORT', { infer: true }),
          user: configService.get<string>('DB_USERNAME', { infer: true }),
          password: configService.get<string>('DB_PASSWORD', { infer: true }),
          database: configService.get<string>('DB_DATABASE', { infer: true }),
          max: configService.get<number>('DB_POOL_MAX', { infer: true }) ?? 10,
          idleTimeoutMillis:
            configService.get<number>('DB_POOL_IDLE_TIMEOUT_MS', {
              infer: true,
            }) ?? 30000,
          connectionTimeoutMillis:
            configService.get<number>('DB_POOL_CONNECTION_TIMEOUT_MS', {
              infer: true,
            }) ?? 2000,
        });
      },
    },
    {
      provide: DRIZZLE_DB,
      inject: [DB_POOL],
      useFactory: (pool: Pool) => {
        return drizzle(pool, { schema });
      },
    },
  ],
  exports: [DB_POOL, DRIZZLE_DB],
})
export class DatabaseModule {}
