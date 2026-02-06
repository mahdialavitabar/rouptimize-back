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

        const databaseUrl = configService.get<string>('DATABASE_URL');
        const poolOptions = {
          max: configService.get<number>('DB_POOL_MAX', { infer: true }) ?? 10,
          idleTimeoutMillis:
            configService.get<number>('DB_POOL_IDLE_TIMEOUT_MS', {
              infer: true,
            }) ?? 30000,
          connectionTimeoutMillis:
            configService.get<number>('DB_POOL_CONNECTION_TIMEOUT_MS', {
              infer: true,
            }) ?? 2000,
        };

        if (databaseUrl) {
          return new Pool({ connectionString: databaseUrl, ...poolOptions });
        }

        return new Pool({
          host: configService.get<string>('DB_HOST'),
          port: configService.get<number>('DB_PORT') ?? 5432,
          user: configService.get<string>('DB_USERNAME'),
          password: configService.get<string>('DB_PASSWORD') ?? '',
          database: configService.get<string>('DB_DATABASE'),
          ...poolOptions,
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
