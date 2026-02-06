import { Injectable } from '@nestjs/common';
import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { RequestContextService } from '../../common/request-context/request-context.service';
import * as schema from '../../db/schema';

@Injectable()
export class DashboardRepository {
  constructor(private readonly ctx: RequestContextService) {}

  private get db() {
    return this.ctx.getDb();
  }

  async getRecentActivity() {
    const [missions, drivers, vehicles] = await Promise.all([
      this.db.query.missions.findMany({
        columns: {
          id: true,
          customerName: true,
          address: true,
          createdAt: true,
        },
        where: (missions, { isNull }) => isNull(missions.deletedAt),
        orderBy: (missions, { desc }) => [desc(missions.createdAt)],
        limit: 5,
      }),
      this.db.query.drivers.findMany({
        columns: {
          id: true,
          name: true,
          phone: true,
          createdAt: true,
        },
        where: (drivers, { isNull }) => isNull(drivers.deletedAt),
        orderBy: (drivers, { desc }) => [desc(drivers.createdAt)],
        limit: 5,
      }),
      this.db.query.vehicles.findMany({
        columns: {
          id: true,
          plateNumber: true,
          model: true,
          createdAt: true,
        },
        where: (vehicles, { isNull }) => isNull(vehicles.deletedAt),
        orderBy: (vehicles, { desc }) => [desc(vehicles.createdAt)],
        limit: 5,
      }),
    ]);

    const activities = [
      ...missions.map((m) => ({
        id: m.id,
        type: 'delivery',
        title: `Mission to ${m.customerName}`,
        description: m.address,
        time: m.createdAt,
      })),
      ...drivers.map((d) => ({
        id: d.id,
        type: 'driver',
        title: `New Driver: ${d.name || 'Unknown'}`,
        description: d.phone || 'No phone',
        time: d.createdAt ?? new Date(),
      })),
      ...vehicles.map((v) => ({
        id: v.id,
        type: 'vehicle',
        title: `New Vehicle: ${v.plateNumber}`,
        description: `${v.model || ''}`,
        time: v.createdAt ?? new Date(),
      })),
    ];

    activities.sort(
      (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime(),
    );

    return activities.slice(0, 10);
  }

  async getStats() {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    const countMissions = async (extra?: any): Promise<number> => {
      const where = extra
        ? and(isNull(schema.missions.deletedAt), extra)
        : isNull(schema.missions.deletedAt);

      const row = await this.db
        .select({ count: sql<number>`COUNT(*)` })
        .from(schema.missions)
        .where(where);

      const firstRow = (row as any[])[0];

      return Number(firstRow?.count ?? 0);
    };

    const dailyMissions = await countMissions(
      eq(schema.missions.date, todayStr),
    );
    const prevDailyMissions = await countMissions(
      eq(schema.missions.date, yesterdayStr),
    );

    const weeklyMissions = await countMissions(
      sql`${schema.missions.date} >= date_trunc('week', CURRENT_DATE)`,
    );

    const prevWeeklyMissions = await countMissions(
      sql`${schema.missions.date} >= date_trunc('week', CURRENT_DATE - INTERVAL '1 week') AND ${schema.missions.date} < date_trunc('week', CURRENT_DATE)`,
    );

    const monthlyMissions = await countMissions(
      sql`${schema.missions.date} >= date_trunc('month', CURRENT_DATE)`,
    );

    const prevMonthlyMissions = await countMissions(
      sql`${schema.missions.date} >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month') AND ${schema.missions.date} < date_trunc('month', CURRENT_DATE)`,
    );

    const totalMissions = await countMissions();

    const successfulMissionsCount = await countMissions(
      isNotNull(schema.missions.deliveryTime),
    );

    const successRate =
      totalMissions > 0 ? (successfulMissionsCount / totalMissions) * 100 : 0;

    const fleetsWhereToday = and(
      eq(schema.missions.date, todayStr),
      isNull(schema.missions.deletedAt),
    );

    const fleetsWhereYesterday = and(
      eq(schema.missions.date, yesterdayStr),
      isNull(schema.missions.deletedAt),
    );

    const activeFleetsCount = await this.db
      .select({
        count: sql<number>`COUNT(DISTINCT ${schema.missions.vehicleId})`,
      })
      .from(schema.missions)
      .where(fleetsWhereToday);

    const activeFleetsCountValue = Number(
      (activeFleetsCount as any[])[0]?.count ?? 0,
    );

    const prevActiveFleetsCount = await this.db
      .select({
        count: sql<number>`COUNT(DISTINCT ${schema.missions.vehicleId})`,
      })
      .from(schema.missions)
      .where(fleetsWhereYesterday);

    const prevActiveFleetsCountValue = Number(
      (prevActiveFleetsCount as any[])[0]?.count ?? 0,
    );

    return {
      dailyMissions,
      dailyMissionsTrend: this.calculateTrend(dailyMissions, prevDailyMissions),
      weeklyMissions,
      weeklyMissionsTrend: this.calculateTrend(
        weeklyMissions,
        prevWeeklyMissions,
      ),
      monthlyMissions,
      monthlyMissionsTrend: this.calculateTrend(
        monthlyMissions,
        prevMonthlyMissions,
      ),
      successfulMissions: Math.round(successRate * 10) / 10,
      successfulMissionsTrend: null,
      activeFleets: activeFleetsCountValue,
      activeFleetsTrend: this.calculateTrend(
        activeFleetsCountValue,
        prevActiveFleetsCountValue,
      ),
    };
  }

  async getChartData(period: 'day' | 'week' | 'month' | 'year') {
    if (period === 'week') {
      const labelExpr = sql<string>`TO_CHAR(${schema.missions.date}, 'Dy')`;
      const rows = await this.db
        .select({
          label: labelExpr,
          value: sql<number>`COUNT(${schema.missions.id})`,
        })
        .from(schema.missions)
        .where(sql`${schema.missions.date} >= date_trunc('week', CURRENT_DATE)`)
        .groupBy(schema.missions.date)
        .orderBy(schema.missions.date);

      return rows.map((r) => ({
        label: r.label ? String(r.label) : 'Unknown',
        value: Number(r.value ?? 0),
      }));
    }

    if (period === 'month') {
      const labelExpr = sql<string>`TO_CHAR(${schema.missions.date}, 'DD')`;
      const rows = await this.db
        .select({
          label: labelExpr,
          value: sql<number>`COUNT(${schema.missions.id})`,
        })
        .from(schema.missions)
        .where(
          sql`${schema.missions.date} >= date_trunc('month', CURRENT_DATE)`,
        )
        .groupBy(schema.missions.date)
        .orderBy(schema.missions.date);

      return rows.map((r) => ({
        label: r.label ? String(r.label) : 'Unknown',
        value: Number(r.value ?? 0),
      }));
    }

    if (period === 'year') {
      const labelExpr = sql<string>`TO_CHAR(${schema.missions.date}, 'Mon')`;
      const monthExpr = sql<number>`EXTRACT(MONTH FROM ${schema.missions.date})`;

      const rows = await this.db
        .select({
          label: labelExpr,
          month: monthExpr,
          value: sql<number>`COUNT(${schema.missions.id})`,
        })
        .from(schema.missions)
        .where(sql`${schema.missions.date} >= date_trunc('year', CURRENT_DATE)`)
        .groupBy(labelExpr, monthExpr)
        .orderBy(monthExpr);

      return rows.map((r) => ({
        label: r.label ? String(r.label) : 'Unknown',
        value: Number(r.value ?? 0),
      }));
    }

    const labelExpr = sql<number>`EXTRACT(HOUR FROM ${schema.missions.startTimeWindow})`;
    const rows = await this.db
      .select({
        label: labelExpr,
        value: sql<number>`COUNT(${schema.missions.id})`,
      })
      .from(schema.missions)
      .where(sql`${schema.missions.date} = CURRENT_DATE`)
      .groupBy(labelExpr)
      .orderBy(labelExpr);

    return rows.map((r) => ({
      label:
        r.label !== null && r.label !== undefined ? String(r.label) : 'Unknown',
      value: Number(r.value ?? 0),
    }));
  }

  private calculateTrend(current: number, previous: number): number | null {
    if (previous === 0) return null;
    return Math.round(((current - previous) / previous) * 100);
  }
}
