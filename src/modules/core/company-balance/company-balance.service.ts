import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { and, eq, gt, isNull, or, sql } from 'drizzle-orm';
import type { PoolClient } from 'pg';
import { RequestContextService } from '../../../common/request-context/request-context.service';
import * as schema from '../../../db/schema';
import {
  CompanyBalanceAction,
  CompanyBalanceType,
} from './company-balance.types';

export type CompanyBalanceDto = {
  companyId: string;
  type: CompanyBalanceType;
  total: number | null;
  remaining: number | null;
  monthlyLimit: number | null;
  periodStart: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CompanyBalancePurchaseDto = {
  id: string;
  companyId: string;
  type: CompanyBalanceType;
  quantity: number;
  createdById: string | null;
  totalAfter: number | null;
  remainingAfter: number | null;
  monthlyLimitAfter: number | null;
  periodStartAfter: Date | null;
  createdAt: Date;
};

export type CompanyBalancePurchaseStatsDto = {
  thisMonthPurchaseCount: number;
  thisMonthQuantity: number;
  totalPurchaseCount: number;
  totalQuantity: number;
  firstPurchaseAt: Date | null;
  lastPurchaseAt: Date | null;
};

function mapBalanceRow(row: schema.CompanyBalanceRow): CompanyBalanceDto {
  return {
    companyId: row.companyId,
    type: row.type as CompanyBalanceType,
    total: row.total ?? null,
    remaining: row.remaining ?? null,
    monthlyLimit: row.monthlyLimit ?? null,
    periodStart: row.periodStart ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapPurchaseRow(
  row: schema.CompanyBalancePurchaseRow,
): CompanyBalancePurchaseDto {
  return {
    id: row.id,
    companyId: row.companyId,
    type: row.type as CompanyBalanceType,
    quantity: row.quantity,
    createdById: row.createdById ?? null,
    totalAfter: row.totalAfter ?? null,
    remainingAfter: row.remainingAfter ?? null,
    monthlyLimitAfter: row.monthlyLimitAfter ?? null,
    periodStartAfter: row.periodStartAfter ?? null,
    createdAt: row.createdAt,
  };
}

@Injectable()
export class CompanyBalanceService {
  constructor(private readonly ctx: RequestContextService) {}

  private get db() {
    return this.ctx.getDb();
  }

  private pgClient(): PoolClient | undefined {
    return this.ctx.get()?.pgClient;
  }

  private requireAdmin(): void {
    if (this.ctx.isSuperAdmin()) return;
    if (this.ctx.isCompanyAdmin()) return;
    throw new ForbiddenException('Only company admin can manage balance');
  }

  private async getOrInit(companyId: string): Promise<CompanyBalanceDto> {
    const existingRows = await this.db
      .select()
      .from(schema.companyBalances)
      .where(eq(schema.companyBalances.companyId, companyId))
      .limit(1);

    const existing = (existingRows as any[])[0] ?? null;

    if (existing) return mapBalanceRow(existing as any);

    try {
      const [created] = await this.db
        .insert(schema.companyBalances)
        .values({
          companyId,
          type: CompanyBalanceType.PER_MISSIONS,
          total: null,
          remaining: null,
          monthlyLimit: null,
          periodStart: null,
        })
        .returning();

      return mapBalanceRow(created as any);
    } catch (e) {
      const rows = await this.db
        .select()
        .from(schema.companyBalances)
        .where(eq(schema.companyBalances.companyId, companyId))
        .limit(1);

      const row = (rows as any[])[0] ?? null;

      if (!row) {
        throw e;
      }

      return mapBalanceRow(row as any);
    }
  }

  async getForCurrentCompany(): Promise<CompanyBalanceDto> {
    const companyId = this.ctx.requireCompanyId();
    return this.getOrInit(companyId);
  }

  async purchaseForCurrentCompany(input: {
    type: CompanyBalanceType;
    quantity: number;
  }): Promise<CompanyBalanceDto> {
    this.requireAdmin();
    const companyId = this.ctx.requireCompanyId();
    const userId = this.ctx.userId() ?? null;
    const current = await this.getOrInit(companyId);

    if (input.type === CompanyBalanceType.PER_VEHICLES_PER_MONTH) {
      const client = this.pgClient();
      if (client) {
        const result = await client.query(
          `UPDATE "company_balance"
           SET "type" = $2::company_balance_type_enum,
               "monthlyLimit" = $3::int,
               "total" = $3::int,
               "remaining" = $3::int,
               "periodStart" = date_trunc('month', now()),
               "updatedAt" = now()
           WHERE "companyId" = $1::uuid
           RETURNING *`,
          [companyId, input.type, input.quantity],
        );

        const updated = mapBalanceRow(result.rows[0] as any);
        await client.query(
          `INSERT INTO "company_balance_purchase" (
             "companyId",
             "type",
             "quantity",
             "createdById",
             "totalAfter",
             "remainingAfter",
             "monthlyLimitAfter",
             "periodStartAfter"
           ) VALUES (
             $1::uuid,
             $2::company_balance_type_enum,
             $3::int,
             $4::uuid,
             $5::int,
             $6::int,
             $7::int,
             $8::timestamptz
           )`,
          [
            companyId,
            input.type,
            input.quantity,
            userId,
            updated.total,
            updated.remaining,
            updated.monthlyLimit,
            updated.periodStart,
          ],
        );

        return updated;
      }

      const [updated] = await this.db
        .update(schema.companyBalances)
        .set({
          type: input.type,
          monthlyLimit: input.quantity,
          total: input.quantity,
          remaining: input.quantity,
          periodStart: new Date(
            Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1),
          ),
          updatedAt: new Date(),
        })
        .where(eq(schema.companyBalances.companyId, companyId))
        .returning();

      const updatedDto = mapBalanceRow(updated as any);
      await this.db.insert(schema.companyBalancePurchases).values({
        companyId,
        type: input.type,
        quantity: input.quantity,
        createdById: userId,
        totalAfter: updatedDto.total,
        remainingAfter: updatedDto.remaining,
        monthlyLimitAfter: updatedDto.monthlyLimit,
        periodStartAfter: updatedDto.periodStart,
      });

      return updatedDto;
    }

    const sameType = current.type === input.type;
    const total = sameType
      ? (current.total ?? 0) + input.quantity
      : input.quantity;
    const remaining = sameType
      ? (current.remaining ?? 0) + input.quantity
      : input.quantity;

    const [updated] = await this.db
      .update(schema.companyBalances)
      .set({
        type: input.type,
        total,
        remaining,
        monthlyLimit: null,
        periodStart: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.companyBalances.companyId, companyId))
      .returning();

    const updatedDto = mapBalanceRow(updated as any);
    await this.db.insert(schema.companyBalancePurchases).values({
      companyId,
      type: input.type,
      quantity: input.quantity,
      createdById: userId,
      totalAfter: updatedDto.total,
      remainingAfter: updatedDto.remaining,
      monthlyLimitAfter: updatedDto.monthlyLimit,
      periodStartAfter: updatedDto.periodStart,
    });

    return updatedDto;
  }

  async listPurchasesForCurrentCompany(input?: {
    limit?: number;
    offset?: number;
  }): Promise<CompanyBalancePurchaseDto[]> {
    const companyId = this.ctx.requireCompanyId();
    const limit = Math.max(1, Math.min(100, input?.limit ?? 20));
    const offset = Math.max(0, input?.offset ?? 0);

    const rows = await this.db
      .select()
      .from(schema.companyBalancePurchases)
      .where(eq(schema.companyBalancePurchases.companyId, companyId))
      .orderBy(sql`${schema.companyBalancePurchases.createdAt} DESC`)
      .limit(limit)
      .offset(offset);

    return rows.map((r) => mapPurchaseRow(r as any));
  }

  async getPurchaseStatsForCurrentCompany(): Promise<CompanyBalancePurchaseStatsDto> {
    const companyId = this.ctx.requireCompanyId();

    const [row] = await this.db
      .select({
        totalPurchaseCount: sql<number>`COUNT(*)`,
        totalQuantity: sql<number>`COALESCE(SUM(${schema.companyBalancePurchases.quantity}), 0)`,
        thisMonthPurchaseCount: sql<number>`COUNT(*) FILTER (WHERE ${schema.companyBalancePurchases.createdAt} >= date_trunc('month', now()))`,
        thisMonthQuantity: sql<number>`COALESCE(SUM(${schema.companyBalancePurchases.quantity}) FILTER (WHERE ${schema.companyBalancePurchases.createdAt} >= date_trunc('month', now())), 0)`,
        firstPurchaseAt: sql<Date | null>`MIN(${schema.companyBalancePurchases.createdAt})`,
        lastPurchaseAt: sql<Date | null>`MAX(${schema.companyBalancePurchases.createdAt})`,
      })
      .from(schema.companyBalancePurchases)
      .where(eq(schema.companyBalancePurchases.companyId, companyId));

    return {
      thisMonthPurchaseCount: Number(row?.thisMonthPurchaseCount ?? 0),
      thisMonthQuantity: Number(row?.thisMonthQuantity ?? 0),
      totalPurchaseCount: Number(row?.totalPurchaseCount ?? 0),
      totalQuantity: Number(row?.totalQuantity ?? 0),
      firstPurchaseAt: (row?.firstPurchaseAt ?? null) as any,
      lastPurchaseAt: (row?.lastPurchaseAt ?? null) as any,
    };
  }

  async consume(action: CompanyBalanceAction): Promise<void> {
    const companyId = this.ctx.requireCompanyId();
    const current = await this.getOrInit(companyId);

    const shouldConsume =
      (action === 'mission_create' &&
        current.type === CompanyBalanceType.PER_MISSIONS) ||
      (action === 'vehicle_create' &&
        current.type === CompanyBalanceType.PER_VEHICLES_PER_MONTH);

    if (!shouldConsume) return;

    if (current.type === CompanyBalanceType.PER_VEHICLES_PER_MONTH) {
      await this.consumeMonthly(companyId);
      return;
    }

    await this.consumeCounter(companyId, current.type);
  }

  private async consumeCounter(
    companyId: string,
    type: CompanyBalanceType,
  ): Promise<void> {
    const client = this.pgClient();

    if (client) {
      const result = await client.query(
        `UPDATE "company_balance"
         SET "remaining" = CASE WHEN "remaining" IS NULL THEN NULL ELSE "remaining" - 1 END,
             "updatedAt" = now()
         WHERE "companyId" = $1::uuid
           AND "type" = $2::company_balance_type_enum
           AND ("remaining" IS NULL OR "remaining" > 0)
         RETURNING "companyId"`,
        [companyId, type],
      );

      if (result.rowCount === 0) {
        throw new ConflictException({
          message: 'Insufficient company balance',
          errorCode: 'BALANCE_EXCEEDED',
          balanceType: type,
        });
      }

      return;
    }

    const updated = await this.db
      .update(schema.companyBalances)
      .set({
        remaining: sql`CASE WHEN ${schema.companyBalances.remaining} IS NULL THEN NULL ELSE ${schema.companyBalances.remaining} - 1 END`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.companyBalances.companyId, companyId),
          eq(schema.companyBalances.type, type),
          or(
            isNull(schema.companyBalances.remaining),
            gt(schema.companyBalances.remaining, 0),
          ),
        ),
      )
      .returning({ companyId: schema.companyBalances.companyId });

    if (updated.length === 0) {
      throw new ConflictException({
        message: 'Insufficient company balance',
        errorCode: 'BALANCE_EXCEEDED',
        balanceType: type,
      });
    }
  }

  private async consumeMonthly(companyId: string): Promise<void> {
    const client = this.pgClient();
    if (!client) {
      const row = await this.getOrInit(companyId);
      if (row.monthlyLimit === null) return;

      const now = new Date();
      const monthStart = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
      );
      const periodStart = row.periodStart ?? monthStart;

      const isNewPeriod = periodStart.getTime() < monthStart.getTime();
      const remaining = isNewPeriod
        ? row.monthlyLimit
        : row.remaining ?? row.monthlyLimit;
      if (remaining <= 0) {
        throw new ConflictException({
          message: 'Insufficient company balance',
          errorCode: 'BALANCE_EXCEEDED',
          balanceType: CompanyBalanceType.PER_VEHICLES_PER_MONTH,
        });
      }

      await this.db
        .update(schema.companyBalances)
        .set({
          periodStart: monthStart,
          total: row.monthlyLimit,
          remaining: remaining - 1,
          updatedAt: new Date(),
        })
        .where(eq(schema.companyBalances.companyId, companyId));
      return;
    }

    const result = await client.query(
      `WITH params AS (
         SELECT date_trunc('month', now()) AS month_start
       )
       UPDATE "company_balance" cb
       SET "periodStart" = CASE
             WHEN cb."monthlyLimit" IS NULL THEN cb."periodStart"
             WHEN cb."periodStart" IS NULL OR cb."periodStart" < (SELECT month_start FROM params)
               THEN (SELECT month_start FROM params)
             ELSE cb."periodStart"
           END,
           "total" = CASE
             WHEN cb."monthlyLimit" IS NULL THEN cb."total"
             ELSE cb."monthlyLimit"
           END,
           "remaining" = CASE
             WHEN cb."monthlyLimit" IS NULL THEN cb."remaining"
             WHEN cb."periodStart" IS NULL OR cb."periodStart" < (SELECT month_start FROM params)
               THEN cb."monthlyLimit" - 1
             ELSE cb."remaining" - 1
           END,
           "updatedAt" = now()
       WHERE cb."companyId" = $1::uuid
         AND cb."type" = 'per_vehicles_per_month'::company_balance_type_enum
         AND (
           cb."monthlyLimit" IS NULL
           OR (
             (cb."periodStart" IS NULL OR cb."periodStart" < (SELECT month_start FROM params))
             AND cb."monthlyLimit" > 0
           )
           OR (
             cb."periodStart" >= (SELECT month_start FROM params)
             AND cb."remaining" > 0
           )
         )
       RETURNING cb."companyId"`,
      [companyId],
    );

    if (result.rowCount === 0) {
      throw new ConflictException({
        message: 'Insufficient company balance',
        errorCode: 'BALANCE_EXCEEDED',
        balanceType: CompanyBalanceType.PER_VEHICLES_PER_MONTH,
      });
    }
  }
}
