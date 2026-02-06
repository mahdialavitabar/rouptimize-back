import { Global, Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, types } from 'pg';
import * as schema from '../../db/schema';
import { DB_POOL, DRIZZLE_DB } from './database.tokens';
import { RLS_DB_ROLE } from './rls-role';

const logger = new Logger('DatabaseModule');

function patchPgParsers(): void {
  types.setTypeParser(1114, (value) => {
    if (value === null) {
      return null;
    }
    return new Date(`${value}Z`);
  });
}

/**
 * Ensures the RLS database role exists and has the correct grants.
 * Runs on every startup but is fully idempotent.
 * This must execute BEFORE any request interceptor tries SET LOCAL ROLE.
 */
async function ensureRlsRole(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${RLS_DB_ROLE}') THEN
          CREATE ROLE ${RLS_DB_ROLE} NOINHERIT NOLOGIN;
          RAISE NOTICE 'Created role ${RLS_DB_ROLE}';
        END IF;
      END
      $$;
    `);
    await client.query(`GRANT USAGE ON SCHEMA public TO ${RLS_DB_ROLE}`);
    await client.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${RLS_DB_ROLE}`,
    );
    await client.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${RLS_DB_ROLE}`,
    );
    logger.log(`RLS role "${RLS_DB_ROLE}" verified and grants applied`);
  } catch (error) {
    logger.error(`Failed to ensure RLS role: ${error}`);
    throw error;
  } finally {
    client.release();
  }
}

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: DB_POOL,
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
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

        const pool = databaseUrl
          ? new Pool({ connectionString: databaseUrl, ...poolOptions })
          : new Pool({
              host: configService.get<string>('DB_HOST'),
              port: configService.get<number>('DB_PORT') ?? 5432,
              user: configService.get<string>('DB_USERNAME'),
              password: configService.get<string>('DB_PASSWORD') ?? '',
              database: configService.get<string>('DB_DATABASE'),
              ...poolOptions,
            });

        // Ensure the RLS role exists before any service uses the pool
        await ensureRlsRole(pool);

        return pool;
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
