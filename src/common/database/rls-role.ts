/**
 * ============================================================================
 * MULTI-TENANCY: RLS DATABASE ROLE & UTILITY FUNCTIONS
 * ============================================================================
 *
 * This module provides the PostgreSQL role name and utility function for
 * setting up Row-Level Security (RLS) context in standalone transactions.
 *
 * WHY A DEDICATED ROLE:
 * - PostgreSQL's default superuser has BYPASSRLS privilege (ignores RLS)
 * - We create a restricted role that MUST obey RLS policies
 * - All application queries run under this role for security
 *
 * WHEN TO USE setLocalRlsRole():
 * - RabbitMQ message handlers (no HTTP request context)
 * - Database seeders
 * - Background jobs
 * - Any code that creates its own transaction outside the interceptor
 *
 * The interceptor handles HTTP requests automatically - this is for everything else.
 */

/**
 * The PostgreSQL role used for all application queries.
 * This role has RLS enforced (no BYPASSRLS privilege).
 * Auto-provisioned by DatabaseModule on every startup (ensureRlsRole).
 */
export const RLS_DB_ROLE = 'rouptimize_app_rls';

/**
 * Default company ID used to initialize the session variable.
 * This is a null UUID that won't match any real company,
 * ensuring no data leaks if context isn't properly set.
 */
const DEFAULT_COMPANY_ID = '00000000-0000-0000-0000-000000000000';

/**
 * Interface for any object that can execute PostgreSQL queries.
 * Compatible with both pg.Pool and pg.PoolClient.
 */
type Queryable = {
  query: (text: string, params?: unknown[]) => Promise<unknown>;
};

/**
 * Sets up the RLS context for a database connection/transaction.
 *
 * WHAT IT DOES (in order):
 * 1. SET LOCAL ROLE - Switch to the RLS-enforced role
 * 2. SET LOCAL app.is_superadmin = 'false' - Default to non-superadmin
 * 3. SET app.current_company_id - Initialize with safe default (no access)
 *
 * IMPORTANT:
 * - Must be called AFTER 'BEGIN' transaction
 * - Caller must then set the actual company ID or superadmin flag
 * - SET LOCAL only affects the current transaction
 *
 * @param client - A PostgreSQL client or pool with query method
 *
 * @example
 * ```typescript
 * const client = await pool.connect();
 * await client.query('BEGIN');
 * await setLocalRlsRole(client);
 * await client.query("SELECT set_config('app.current_company_id', $1, true)", [companyId]);
 * // ... execute queries with RLS enforced ...
 * await client.query('COMMIT');
 * client.release();
 * ```
 */
export async function setLocalRlsRole(client: Queryable): Promise<void> {
  await client.query(`SET LOCAL ROLE ${RLS_DB_ROLE}`);
  await client.query("SET LOCAL app.is_superadmin = 'false'");
  await client.query("SELECT set_config('app.current_company_id', $1, true)", [
    DEFAULT_COMPANY_ID,
  ]);
}
