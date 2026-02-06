/**
 * ============================================================================
 * MULTI-TENANCY: REQUEST CONTEXT INTERCEPTOR
 * ============================================================================
 *
 * This NestJS interceptor is the HEART of our multi-tenancy implementation.
 * It runs for EVERY HTTP request and sets up PostgreSQL Row-Level Security.
 *
 * WHAT IT DOES:
 * 1. Extracts user info from JWT (companyId, isSuperAdmin, etc.)
 * 2. Acquires a PostgreSQL connection from the pool
 * 3. Starts a transaction and sets the RLS role
 * 4. Sets session variables (app.current_company_id or app.is_superadmin)
 * 5. Wraps the request in AsyncLocalStorage context
 * 6. Commits or rolls back the transaction when done
 *
 * WHY THIS ARCHITECTURE:
 * - Each request gets its own transaction with RLS context
 * - PostgreSQL policies automatically filter data by company
 * - No way to accidentally access another tenant's data
 * - Clean separation: interceptor handles RLS, repositories just query
 *
 * FLOW:
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ HTTP Request with JWT                                          │
 * └─────────────────────────────────────────────────────────────────┘
 *                              │
 *                              ▼
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ Interceptor: Extract user context from JWT                     │
 * └─────────────────────────────────────────────────────────────────┘
 *                              │
 *                              ▼
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ BEGIN transaction + SET LOCAL ROLE + SET app.current_company_id│
 * └─────────────────────────────────────────────────────────────────┘
 *                              │
 *                              ▼
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ Controller → Service → Repository (all use RLS-aware DB)       │
 * └─────────────────────────────────────────────────────────────────┘
 *                              │
 *                              ▼
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ COMMIT (success) or ROLLBACK (error)                           │
 * └─────────────────────────────────────────────────────────────────┘
 */
import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
  UnauthorizedException,
} from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool, PoolClient } from 'pg';
import { Observable, from, switchMap } from 'rxjs';
import * as schema from '../../db/schema';
import type { JwtUser } from '../../modules/core/auth/shared/interfaces/jwt-user.interface';
import { DB_POOL } from '../database/database.tokens';
import { RLS_DB_ROLE } from '../database/rls-role';
import {
  RequestContextService,
  type RequestContextData,
} from './request-context.service';

@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  constructor(
    private readonly ctx: RequestContextService,
    @Inject(DB_POOL) private readonly pool: Pool,
  ) {}

  /**
   * Main intercept method - runs for every HTTP request.
   *
   * STEP 1: Extract user context from JWT (already validated by AuthGuard)
   * STEP 2: Validate company scope for non-superadmin users
   * STEP 3: Decide if we need a transaction (authenticated users do)
   * STEP 4: Set up RLS context and run the request handler
   */
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const user: JwtUser | undefined = request.user;

    if (user && !user.isSuperAdmin && !user.companyId) {
      throw new UnauthorizedException(
        'Company scope missing for authenticated user',
      );
    }

    const data: RequestContextData = {
      companyId: user?.companyId,
      branchId: user?.branchId,
      userId: user?.userId,
      actorType: user ? user.actorType ?? 'web' : undefined,
      isSuperAdmin: user?.isSuperAdmin ?? false,
      roleName: user?.role?.name,
      permissions: user?.role?.authorizations ?? [],
    };

    request.requestContext = data;

    const needsTransaction = Boolean(data.isSuperAdmin || data.companyId);
    if (!needsTransaction) {
      return this.runWithoutTransaction(data, next);
    }

    return this.runWithTransaction(data, next);
  }

  /**
   * Handles unauthenticated requests (public endpoints).
   * No transaction or RLS context needed.
   */
  private runWithoutTransaction(
    data: RequestContextData,
    next: CallHandler,
  ): Observable<any> {
    return new Observable((subscriber) => {
      this.ctx.run(data, () => {
        next.handle().subscribe({
          next: (v) => subscriber.next(v),
          error: (e) => subscriber.error(e),
          complete: () => subscriber.complete(),
        });
      });
    });
  }

  /**
   * Handles authenticated requests with full RLS setup.
   * This is where the multi-tenancy magic happens!
   */
  private runWithTransaction(
    data: RequestContextData,
    next: CallHandler,
  ): Observable<any> {
    return from(this.setupTransaction(data)).pipe(
      switchMap(({ client, effectiveData }) => {
        return new Observable((subscriber) => {
          this.ctx.run(
            {
              ...effectiveData,
              pgClient: client,
              db: drizzle(client, { schema }),
            },
            () => {
              next.handle().subscribe({
                next: (v) => subscriber.next(v),
                error: async (e) => {
                  await this.rollback(client);
                  subscriber.error(e);
                },
                complete: async () => {
                  await this.commit(client);
                  subscriber.complete();
                },
              });
            },
          );
        });
      }),
    );
  }

  /**
   * Sets up the PostgreSQL transaction with RLS context.
   *
   * STEP 1: Get a connection from the pool
   * STEP 2: BEGIN transaction
   * STEP 3: SET LOCAL ROLE to RLS-enforced role
   * STEP 4: Refresh user context from DB (security: don't trust JWT blindly)
   * STEP 5: Set RLS session variables based on user type
   */
  private async setupTransaction(
    data: RequestContextData,
  ): Promise<{ client: PoolClient; effectiveData: RequestContextData }> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL ROLE ${RLS_DB_ROLE}`);

      const effectiveData = data.userId
        ? await this.refreshUserContext(client, data)
        : data;

      await this.setRlsContext(client, effectiveData);

      return { client, effectiveData };
    } catch (err) {
      console.error('[setupTransaction] Error setting up transaction:', err);
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr) {
        console.error('[setupTransaction] Error during rollback:', rollbackErr);
      }
      client.release();
      throw err;
    }
  }

  /**
   * Refreshes user context from the database.
   *
   * WHY: JWT tokens can be stale - user might have been moved to
   * a different company or had their superadmin status changed.
   * We always verify against the current database state.
   */
  private async refreshUserContext(
    client: PoolClient,
    data: RequestContextData,
  ): Promise<RequestContextData> {
    const actorType = data.actorType ?? 'web';

    try {
      // Allow lookup regardless of tenant so we can refresh the true context
      await client.query(`SET LOCAL app.is_superadmin = 'true'`);
      await client.query(
        `SELECT set_config('app.current_company_id', '', true)`,
      );

      const result =
        actorType === 'mobile'
          ? await client.query(
              `SELECT "companyId", "branchId", "isSuperAdmin" FROM "mobile_user" WHERE id = $1 AND "deletedAt" IS NULL LIMIT 1`,
              [data.userId],
            )
          : await client.query(
              `SELECT "companyId", "branchId", "isSuperAdmin" FROM "user" WHERE id = $1 AND "deletedAt" IS NULL LIMIT 1`,
              [data.userId],
            );

      const row = (result as any)?.rows?.[0] as
        | {
            companyId: string | null;
            branchId: string | null;
            isSuperAdmin: boolean;
          }
        | undefined;

      if (!row) {
        throw new UnauthorizedException(
          actorType === 'mobile' ? 'Mobile user not found' : 'User not found',
        );
      }

      return {
        ...data,
        companyId: row.companyId ?? undefined,
        branchId: row.branchId ?? undefined,
        isSuperAdmin: Boolean(row.isSuperAdmin),
      };
    } catch (err) {
      console.error(
        `[refreshUserContext] Error refreshing user context for ${actorType} user ${data.userId}:`,
        err,
      );
      throw err;
    }
  }

  /**
   * Sets the PostgreSQL session variables for RLS policies.
   *
   * FOR SUPERADMIN:
   *   SET LOCAL app.is_superadmin = 'true'
   *   SET app.current_company_id = '' (empty string to avoid query errors)
   *   → RLS policy allows access to ALL rows
   *
   * FOR REGULAR USERS:
   *   SET LOCAL app.is_superadmin = 'false'
   *   SET app.current_company_id = '<company-uuid>'
   *   → RLS policy filters to only this company's rows
   */
  private async setRlsContext(
    client: PoolClient,
    data: RequestContextData,
  ): Promise<void> {
    if (data.isSuperAdmin) {
      await client.query(`SET LOCAL app.is_superadmin = 'true'`);
      await client.query(
        `SELECT set_config('app.current_company_id', '', true)`,
      );
      return;
    }

    if (!data.companyId) {
      throw new UnauthorizedException(
        'Company scope missing for authenticated user',
      );
    }

    await client.query(`SET LOCAL app.is_superadmin = 'false'`);
    await client.query(
      `SELECT set_config('app.current_company_id', $1::text, true)`,
      [data.companyId],
    );
  }

  /**
   * Commits the transaction and releases the connection back to pool.
   */
  private async commit(client: PoolClient): Promise<void> {
    try {
      await client.query('COMMIT');
    } finally {
      client.release();
    }
  }

  /**
   * Rolls back the transaction and releases the connection.
   * Used when an error occurs during request handling.
   */
  private async rollback(client: PoolClient): Promise<void> {
    try {
      await client.query('ROLLBACK');
    } catch {}
    client.release();
  }
}
