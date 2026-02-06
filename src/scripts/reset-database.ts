import * as dotenv from 'dotenv';
import { eq, getTableName, inArray, is } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { PgTable } from 'drizzle-orm/pg-core';
import { reset } from 'drizzle-seed';
import * as path from 'path';
import { Pool, types } from 'pg';
import * as schema from '../db/schema';
import { users } from '../db/schema';

const DB_TABLES_TO_EXCLUDE = ['mobile_user'] as const;

function filterSchema(
  schemaModule: Record<string, unknown>,
  excludeDbTableNames: readonly string[] = [],
): Record<string, PgTable> {
  return Object.fromEntries(
    Object.entries(schemaModule).filter(([, value]) => {
      if (!is(value, PgTable)) return false;
      const dbTableName = getTableName(value);
      return !excludeDbTableNames.includes(dbTableName);
    }),
  ) as Record<string, PgTable>;
}

function getSchemaTableNames(
  schemaModule: Record<string, unknown>,
): { exportName: string; dbTableName: string }[] {
  return Object.entries(schemaModule)
    .filter(([, value]) => is(value, PgTable))
    .map(([exportName, value]) => ({
      exportName,
      dbTableName: getTableName(value as PgTable),
    }));
}

const workspaceRoot = path.resolve(__dirname, '../../../..');
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

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(
  message: string,
  type: 'info' | 'success' | 'warning' | 'error' = 'info',
) {
  const icons = {
    info: `${COLORS.blue}ℹ️${COLORS.reset}`,
    success: `${COLORS.green}✅${COLORS.reset}`,
    warning: `${COLORS.yellow}⚠️${COLORS.reset}`,
    error: `${COLORS.red}❌${COLORS.reset}`,
  };
  console.log(`  ${icons[type]}  ${message}`);
}

function printHeader(text: string) {
  const width = 60;
  console.log('');
  console.log(
    `${COLORS.bright}${COLORS.cyan}${'═'.repeat(width)}${COLORS.reset}`,
  );
  console.log(`${COLORS.bright}${COLORS.cyan}  ${text}${COLORS.reset}`);
  console.log(
    `${COLORS.bright}${COLORS.cyan}${'═'.repeat(width)}${COLORS.reset}`,
  );
  console.log('');
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

types.setTypeParser(types.builtins.NUMERIC, (val) => parseFloat(val));

async function main() {
  const nodeEnv = process.env.NODE_ENV || 'development';

  printHeader('🗑️  Database Reset Script');

  if (nodeEnv === 'production') {
    log('Cannot run database reset in production environment!', 'error');
    process.exit(1);
  }

  log(`Environment: ${nodeEnv}`, 'info');

  const allTables = getSchemaTableNames(schema);
  const filteredSchema = filterSchema(schema, DB_TABLES_TO_EXCLUDE);
  const tablesToReset = Object.keys(filteredSchema).map((exportName) => {
    const table = filteredSchema[exportName];
    return { exportName, dbTableName: getTableName(table!) };
  });

  log(
    `Discovered ${allTables.length} tables in schema, will reset ${tablesToReset.length}`,
    'info',
  );
  if (DB_TABLES_TO_EXCLUDE.length > 0) {
    log(`Excluding DB tables: ${DB_TABLES_TO_EXCLUDE.join(', ')}`, 'info');
  }

  const pool = new Pool({
    connectionString: buildDatabaseUrl(),
  });

  const db = drizzle(pool, { schema });

  try {
    log('Backing up superadmin users...', 'info');
    const superadminUsers = await db
      .select()
      .from(users)
      .where(eq(users.isSuperAdmin, true));

    if (superadminUsers.length > 0) {
      log(
        `Found ${superadminUsers.length} superadmin user(s) to preserve`,
        'info',
      );
    } else {
      log('No superadmin users found', 'warning');
    }

    const companyIds = Array.from(
      new Set(
        superadminUsers
          .map((u) => u.companyId)
          .filter((id): id is string => Boolean(id)),
      ),
    );
    const branchIds = Array.from(
      new Set(
        superadminUsers
          .map((u) => u.branchId)
          .filter((id): id is string => Boolean(id)),
      ),
    );
    const roleIds = Array.from(
      new Set(
        superadminUsers
          .map((u) => u.roleId)
          .filter((id): id is string => Boolean(id)),
      ),
    );

    const companiesToRestore = companyIds.length
      ? await db
          .select()
          .from(schema.companies)
          .where(inArray(schema.companies.id, companyIds))
      : [];

    const branchesToRestore = branchIds.length
      ? await db
          .select()
          .from(schema.branches)
          .where(inArray(schema.branches.id, branchIds))
      : [];

    const rolesToRestore = roleIds.length
      ? await db
          .select()
          .from(schema.roles)
          .where(inArray(schema.roles.id, roleIds))
      : [];

    log('Starting database reset...', 'info');
    log('This will TRUNCATE all tables with CASCADE', 'warning');

    await reset(db, filteredSchema);

    log('Database reset completed successfully!', 'success');
    log(
      `Reset ${tablesToReset.length} tables: ${tablesToReset
        .map((t) => t.dbTableName)
        .join(', ')}`,
      'info',
    );

    if (superadminUsers.length > 0) {
      if (companiesToRestore.length > 0) {
        log(`Restoring ${companiesToRestore.length} company row(s)...`, 'info');
        await db.insert(schema.companies).values(companiesToRestore);
      }

      if (branchesToRestore.length > 0) {
        log(`Restoring ${branchesToRestore.length} branch row(s)...`, 'info');
        await db.insert(schema.branches).values(branchesToRestore);
      }

      if (rolesToRestore.length > 0) {
        log(`Restoring ${rolesToRestore.length} role row(s)...`, 'info');
        await db.insert(schema.roles).values(rolesToRestore);
      }

      log('Restoring superadmin users...', 'info');
      await db.insert(users).values(superadminUsers);
      log(`Restored ${superadminUsers.length} superadmin user(s)`, 'success');
    }

    log('All tables have been truncated (superadmin preserved)', 'info');
  } catch (error) {
    log(`Error resetting database: ${error}`, 'error');
    throw error;
  } finally {
    await pool.end();
  }
}

(async () => {
  try {
    await main();
    printHeader('✨ Reset Complete');
    process.exit(0);
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
})();
