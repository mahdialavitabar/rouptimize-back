/**
 * ============================================================================
 * MULTI-TENANCY: REQUEST CONTEXT SERVICE
 * ============================================================================
 *
 * This service provides request-scoped storage using Node.js AsyncLocalStorage.
 * It's the bridge between the HTTP interceptor and the repositories.
 *
 * WHY ASYNCLOCALSTORAGE:
 * - Each HTTP request gets its own isolated context
 * - No need for request-scoped providers (which have performance overhead)
 * - Works across async/await boundaries automatically
 * - Similar to ThreadLocal in Java or Context in Go
 *
 * WHAT'S STORED:
 * - companyId: The tenant identifier for RLS
 * - branchId: Optional sub-tenant for branch-level filtering
 * - userId: The authenticated user's ID
 * - isSuperAdmin: Whether to bypass RLS
 * - db: The Drizzle ORM instance with RLS context already set
 * - pgClient: The underlying PostgreSQL client for the transaction
 *
 * HOW REPOSITORIES USE IT:
 * ```typescript
 * class MyRepository {
 *   constructor(private ctx: RequestContextService) {}
 *
 *   findAll() {
 *     return this.ctx.getDb().query.myTable.findMany();
 *     // ↑ Returns ONLY rows for the current tenant!
 *   }
 * }
 * ```
 */
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { PoolClient } from 'pg';
import * as schema from '../../db/schema';
import { DRIZZLE_DB } from '../database/database.tokens';

/**
 * Data stored in the request context (without database references).
 * Used for serialization (e.g., passing to message queues).
 */
export type RequestContextData = {
  companyId?: string;
  branchId?: string;
  userId?: string;
  actorType?: 'web' | 'mobile';
  isSuperAdmin: boolean;
  roleName?: string;
  permissions: string[];
};

/**
 * Full context including database connection.
 * This is what's actually stored in AsyncLocalStorage.
 */
export type RequestContextStoreValue = RequestContextData & {
  db?: NodePgDatabase<typeof schema>;
  pgClient?: PoolClient;
};

/**
 * The AsyncLocalStorage instance - singleton for the entire application.
 * Each async context (request) gets its own store automatically.
 */
const storage = new AsyncLocalStorage<RequestContextStoreValue>();

@Injectable()
export class RequestContextService {
  constructor(
    @Inject(DRIZZLE_DB)
    private readonly defaultDb: NodePgDatabase<typeof schema>,
  ) {}

  /**
   * Executes a callback within a specific context.
   * Used by the interceptor to wrap request handling.
   *
   * @param data - The context data to make available
   * @param callback - The code to run within this context
   */
  run<T>(data: RequestContextStoreValue, callback: () => T): T {
    return storage.run(data, callback);
  }

  /**
   * Gets the raw store value. Use specific getters when possible.
   */
  get(): RequestContextStoreValue | undefined {
    return storage.getStore();
  }

  /**
   * Gets the Drizzle DB instance for the current request.
   * This DB has RLS context already configured!
   *
   * Falls back to default DB if no request context (e.g., startup).
   */
  getDb(): NodePgDatabase<typeof schema> {
    return storage.getStore()?.db ?? this.defaultDb;
  }

  /**
   * Creates a serializable snapshot of the current context.
   * Used when passing context to message queues.
   */
  snapshot(): RequestContextData {
    const ctx = storage.getStore();
    return {
      companyId: ctx?.companyId,
      branchId: ctx?.branchId,
      userId: ctx?.userId,
      actorType: ctx?.actorType,
      isSuperAdmin: ctx?.isSuperAdmin ?? false,
      roleName: ctx?.roleName,
      permissions: ctx?.permissions ?? [],
    };
  }

  /**
   * Gets the current branch ID (for branch-level filtering).
   */
  branchId(): string | undefined {
    return storage.getStore()?.branchId;
  }

  /**
   * Determines the effective branchId for filtering based on user role.
   *
   * Role-aware filtering logic:
   * - Regular users (branch staff, drivers): Enforced to their assigned branch (security)
   * - Company Admin: Uses query param if provided, otherwise returns undefined (all branches)
   * - Super Admin: Same as company admin
   *
   * @param queryBranchId - The branchId from query parameter (UI filter)
   * @returns The effective branchId for filtering, or undefined for all branches
   */
  getEffectiveBranchId(queryBranchId?: string): string | undefined {
    const canFilterAnyBranch = this.isCompanyAdmin() || this.isSuperAdmin();

    if (canFilterAnyBranch) {
      // Admins can filter by query param, or see all if not specified
      return queryBranchId;
    }

    // Non-admins are restricted to their own branch (RLS enforcement)
    return this.branchId();
  }

  /**
   * Gets the current user's ID.
   */
  userId(): string | undefined {
    return storage.getStore()?.userId;
  }

  /**
   * Checks if current user is a super admin (bypasses RLS).
   */
  isSuperAdmin(): boolean {
    return storage.getStore()?.isSuperAdmin ?? false;
  }

  /**
   * Checks if current user is a company admin.
   */
  isCompanyAdmin(): boolean {
    return storage.getStore()?.roleName === 'companyAdmin';
  }

  /**
   * Gets the company ID or throws if not available.
   * Use this when company context is REQUIRED (e.g., creating records).
   *
   * @throws UnauthorizedException if no company context
   */
  requireCompanyId(): string {
    const companyId = storage.getStore()?.companyId;
    if (!companyId) {
      throw new UnauthorizedException('Company scope missing for user');
    }
    return companyId;
  }

  /**
   * Runs a callback within a database transaction.
   * The context's DB instance is replaced with the transaction for the duration of the callback.
   */
  async runInTransaction<T>(callback: () => Promise<T>): Promise<T> {
    const store = this.get();
    const db = store?.db ?? this.defaultDb;

    return db.transaction(async (tx) => {
      if (store) {
        const newStore = { ...store, db: tx as any };
        return this.run(newStore, callback);
      }
      return callback();
    });
  }
}
