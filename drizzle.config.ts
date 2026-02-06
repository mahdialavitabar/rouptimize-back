import * as dotenv from 'dotenv';
import { defineConfig } from 'drizzle-kit';
import * as path from 'path';

const workspaceRoot = path.resolve(__dirname, '../..');

// Check if DB_HOST is already set (e.g. by Docker)
const isSystemEnv = !!process.env.DB_HOST;

// Load environment-specific config
if (!process.env.NODE_ENV || process.env.NODE_ENV === 'development') {
  dotenv.config({
    path: path.join(workspaceRoot, '.env.development'),
    override: !isSystemEnv,
  });
} else {
  dotenv.config({
    path: path.join(workspaceRoot, '.env'),
    override: !isSystemEnv,
  });
}

function buildDatabaseUrl(): string {
  const direct = process.env.DATABASE_URL;
  if (direct) {
    return direct;
  }

  const host = process.env.DB_HOST;
  const port = process.env.DB_PORT ?? '5432';
  const username = process.env.DB_USERNAME;
  const password = process.env.DB_PASSWORD ?? '';
  const database = process.env.DB_DATABASE;

  if (!host || !username || !database) {
    throw new Error(
      'Missing DB config. Provide DATABASE_URL or DB_HOST/DB_USERNAME/DB_DATABASE env vars.',
    );
  }

  const encodedPassword = encodeURIComponent(password);
  return `postgresql://${username}:${encodedPassword}@${host}:${port}/${database}`;
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: buildDatabaseUrl(),
  },
  migrations: {
    table: 'journal',
    schema: 'drizzle',
  },
  entities: {
    roles: {
      exclude: ['rouptimize_app_rls'],
    },
  },
  verbose: true,
});
