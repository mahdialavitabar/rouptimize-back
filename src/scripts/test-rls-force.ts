import { randomUUID } from 'crypto';
import * as dotenv from 'dotenv';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as path from 'path';
import { Pool, types } from 'pg';
import * as schema from '../db/schema';

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

types.setTypeParser(types.builtins.NUMERIC, (val) => parseFloat(val));

type TenantTableCheckRow = {
  table_name: string;
  rls_enabled: boolean;
  rls_forced: boolean;
  owner: string;
};

type PolicyCheckRow = {
  tablename: string;
  policyname: string;
};

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

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const pool = new Pool({ connectionString: buildDatabaseUrl() });
  const client = await pool.connect();

  const testRoleName = 'rouptimize_rls_test';

  try {
    const { rows: currentUserRows } = await client.query<{
      current_user: string;
    }>('select current_user');

    const [{ current_user }] = currentUserRows;

    const { rows: roleFlagRows } = await client.query<{
      rolsuper: boolean;
      rolbypassrls: boolean;
    }>(
      `
        select rolsuper, rolbypassrls
        from pg_roles
        where rolname = current_user
        `,
    );

    const [{ rolsuper, rolbypassrls }] = roleFlagRows;

    console.log('RLS Force Check');
    console.log(`DB user: ${current_user}`);
    console.log(
      `DB role flags: superuser=${rolsuper} bypassrls=${rolbypassrls}`,
    );

    const { rows: tenantTables } = await client.query<TenantTableCheckRow>(
      `
        select
          c.relname as table_name,
          c.relrowsecurity as rls_enabled,
          c.relforcerowsecurity as rls_forced,
          pg_get_userbyid(c.relowner) as owner
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relkind = 'r'
          and exists (
            select 1
            from information_schema.columns cols
            where cols.table_schema = 'public'
              and cols.table_name = c.relname
              and cols.column_name = 'companyId'
          )
          and c.relname <> 'user'
        order by c.relname asc
        `,
    );

    assert(
      tenantTables.length > 0,
      'No tenant tables found (companyId tables)',
    );

    const { rows: policyRows } = await client.query<PolicyCheckRow>(
      `
        select tablename, policyname
        from pg_policies
        where schemaname = 'public'
          and policyname = 'tenant_isolation_company'
        `,
    );

    const policyByTable = new Set(policyRows.map((r) => r.tablename));

    let missingForce = 0;
    let missingEnable = 0;
    let missingPolicy = 0;

    for (const t of tenantTables) {
      const hasPolicy = policyByTable.has(t.table_name);
      if (!t.rls_enabled) {
        missingEnable += 1;
      }
      if (!t.rls_forced) {
        missingForce += 1;
      }
      if (!hasPolicy) {
        missingPolicy += 1;
      }

      const status = [
        t.rls_enabled ? 'RLS=on' : 'RLS=off',
        t.rls_forced ? 'FORCE=on' : 'FORCE=off',
        hasPolicy ? 'POLICY=ok' : 'POLICY=missing',
      ].join(' ');

      console.log(`${t.table_name}: ${status} (owner=${t.owner})`);
    }

    assert(missingEnable === 0, 'Some tenant tables have RLS disabled');
    assert(missingPolicy === 0, 'Some tenant tables are missing tenant policy');
    assert(
      missingForce === 0,
      'Some tenant tables do not have FORCE ROW LEVEL SECURITY enabled',
    );

    if (rolsuper || rolbypassrls) {
      await client.query(
        `DO $$
         BEGIN
           IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${testRoleName}') THEN
             CREATE ROLE ${testRoleName} NOINHERIT;
           END IF;
         END $$;`,
      );

      await client.query(`GRANT USAGE ON SCHEMA public TO ${testRoleName}`);
      await client.query(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${testRoleName}`,
      );
      await client.query(
        `GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO ${testRoleName}`,
      );
    }

    await client.query('begin');

    const db = drizzle(client, { schema });

    const companyA = randomUUID();
    const companyB = randomUUID();

    await db.insert(schema.companies).values([
      { id: companyA, name: 'RLS Test Company A' },
      { id: companyB, name: 'RLS Test Company B' },
    ]);

    const roleA = randomUUID();
    const roleB = randomUUID();

    await db.insert(schema.roles).values([
      {
        id: roleA,
        name: 'RLS Test Role A',
        description: null,
        authorizations: null,
        companyId: companyA,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      },
      {
        id: roleB,
        name: 'RLS Test Role B',
        description: null,
        authorizations: null,
        companyId: companyB,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      },
    ]);

    if (rolsuper || rolbypassrls) {
      await client.query(`SET ROLE ${testRoleName}`);
    }

    await client.query("SET LOCAL app.is_superadmin = 'false'");
    await client.query(
      "SELECT set_config('app.current_company_id', $1::text, true)",
      [companyA],
    );

    const { rows: visibleAsCompanyA } = await client.query<{
      id: string;
      companyId: string;
    }>(
      'select id, "companyId" from role where id = $1 or id = $2 order by id asc',
      [roleA, roleB],
    );

    assert(
      visibleAsCompanyA.length === 1 && visibleAsCompanyA[0].id === roleA,
      'RLS tenant filtering failed: expected to see only company A role',
    );

    await client.query("SET LOCAL app.is_superadmin = 'true'");

    const { rows: visibleAsSuperadmin } = await client.query<{ id: string }>(
      'select id from role where id = $1 or id = $2 order by id asc',
      [roleA, roleB],
    );

    assert(
      visibleAsSuperadmin.length === 2,
      'RLS superadmin bypass failed: expected to see both roles',
    );

    console.log(
      'OK: RLS is forced and tenant filtering works without whereCompany.',
    );

    await client.query('rollback');
    if (rolsuper || rolbypassrls) {
      await client.query('RESET ROLE');
    }
  } catch (err) {
    try {
      await client.query('rollback');
    } catch {
      undefined;
    }

    try {
      await client.query('RESET ROLE');
    } catch {
      undefined;
    }

    console.error(String(err));
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(String(err));
  process.exit(1);
});
