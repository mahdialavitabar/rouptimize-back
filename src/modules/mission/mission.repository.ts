import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { RequestContextService } from '../../common/request-context/request-context.service';
import * as schema from '../../db/schema';
import { BranchResponseDto } from '../branch/dto/branch.response.dto';
import { VehicleResponseDto } from '../vehicle/dto/vehicle.response.dto';
import { MissionStatus } from './dto/mission-status.enum';
import { MissionResponseDto } from './dto/mission.response.dto';

type DistributionViewSortBy = 'timeWindow' | 'customerName' | 'status';
type DistributionViewSortOrder = 'asc' | 'desc';
type DistributionViewGroupBy = 'driver' | 'status';

@Injectable()
export class MissionRepository {
  constructor(private readonly ctx: RequestContextService) {}

  private get db() {
    return this.ctx.getDb();
  }

  async updateMissionsRoute(missionIds: string[], routeId: string) {
    if (missionIds.length === 0) return;

    await this.db
      .update(schema.missions)
      .set({
        routeId,
        status: sql`CASE WHEN ${schema.missions.status} = 'unassigned' THEN 'assigned'::missions_status_enum ELSE ${schema.missions.status} END`,
        updatedAt: new Date(),
      })
      .where(inArray(schema.missions.id, missionIds));
  }

  /**
   * Removes missions from any existing route membership.
   * Keeps data consistent across both `route_missions` and `missions.routeId`.
   */
  async detachMissionsFromRoutes(missionIds: string[]) {
    if (missionIds.length === 0) return;

    const memberships = await this.db
      .select({ routeId: schema.routeMissions.routeId })
      .from(schema.routeMissions)
      .where(inArray(schema.routeMissions.missionId, missionIds as any));

    const affectedRouteIds = Array.from(
      new Set(memberships.map((m) => m.routeId).filter(Boolean)),
    );

    await this.db
      .delete(schema.routeMissions)
      .where(inArray(schema.routeMissions.missionId, missionIds as any));

    await this.db
      .update(schema.missions)
      .set({ routeId: null as any, updatedAt: new Date() })
      .where(
        and(
          inArray(schema.missions.id, missionIds as any),
          isNull(schema.missions.deletedAt),
        ),
      );

    // If a route becomes empty, soft-delete it so it disappears from `/routes`.
    for (const routeId of affectedRouteIds) {
      const [{ count }] = await this.db
        .select({ count: sql<number>`count(*)` })
        .from(schema.routeMissions)
        .where(eq(schema.routeMissions.routeId, routeId));

      const remaining = Number(count ?? 0);

      if (remaining === 0) {
        await this.db
          .update(schema.routes)
          .set({ deletedAt: new Date(), updatedAt: new Date() })
          .where(
            and(eq(schema.routes.id, routeId), isNull(schema.routes.deletedAt)),
          );
      } else {
        await this.db
          .update(schema.routes)
          .set({ updatedAt: new Date() })
          .where(
            and(eq(schema.routes.id, routeId), isNull(schema.routes.deletedAt)),
          );
      }
    }
  }

  async updateAssignment(
    ids: string[],
    data: {
      vehicleId?: string | null;
      vehiclePlate?: string | null;
      driverId?: string | null;
      driverName?: string | null;
    },
  ) {
    if (ids.length === 0) return;

    const vehicleId = data.vehicleId ?? null;
    const vehiclePlate = data.vehiclePlate ?? null;
    const driverId = data.driverId ?? null;
    const driverName = data.driverName ?? null;

    await this.db
      .update(schema.missions)
      .set({
        vehicleId,
        vehiclePlate,
        driverId,
        driverName,
        status: sql`CASE
          WHEN ${schema.missions.status} IN ('inProgress', 'delivered') THEN ${schema.missions.status}
          WHEN ${vehicleId}::text IS NULL AND ${driverId}::text IS NULL THEN 'unassigned'::missions_status_enum
          ELSE 'assigned'::missions_status_enum
        END`,
        updatedAt: new Date(),
      })
      .where(inArray(schema.missions.id, ids));
  }

  findByIds(ids: string[]): Promise<MissionResponseDto[]> {
    if (!ids.length) {
      return Promise.resolve([]);
    }
    // Admins can access missions from any branch
    const effectiveBranchId = this.ctx.getEffectiveBranchId(undefined);

    return this.db.query.missions.findMany({
      where: (missions, { and, inArray, isNull, eq }) =>
        and(
          inArray(missions.id, ids),
          isNull(missions.deletedAt),
          effectiveBranchId
            ? eq(missions.branchId, effectiveBranchId)
            : undefined,
        ),
    }) as any;
  }

  findAll(
    date?: string,
    branchId?: string,
    driverId?: string,
  ): Promise<MissionResponseDto[]> {
    const effectiveBranchId = this.ctx.getEffectiveBranchId(branchId);

    return this.db.query.missions.findMany({
      with: {
        company: true,
        branch: true,
        createdBy: true,
      },
      where: (missions, { and, eq, isNull }) =>
        and(
          date ? eq(missions.date, date as any) : undefined,
          isNull(missions.deletedAt),
          effectiveBranchId
            ? eq(missions.branchId, effectiveBranchId)
            : undefined,
          driverId ? eq(missions.driverId, driverId) : undefined,
        ),
    }) as any;
  }

  findDistributionViewOrdered(params: {
    date?: string;
    branchId?: string;
    sortBy: DistributionViewSortBy;
    sortOrder: DistributionViewSortOrder;
    groupBy: DistributionViewGroupBy;
  }): Promise<MissionResponseDto[]> {
    const effectiveBranchId = this.ctx.getEffectiveBranchId(params.branchId);
    const isDesc = params.sortOrder === 'desc';

    const normalizedDriver = sql<string>`NULLIF(BTRIM(${schema.missions.driverName}), '')`;
    const hasAnyDriver = sql<boolean>`(${schema.missions.driverId} IS NOT NULL OR ${normalizedDriver} IS NOT NULL)`;
    const effectiveStatus = sql<MissionStatus>`CASE
      WHEN ${schema.missions.status} = 'unassigned'::missions_status_enum AND ${hasAnyDriver}
        THEN 'assigned'::missions_status_enum
      ELSE ${schema.missions.status}
    END`;
    const statusRank = sql<number>`CASE ${effectiveStatus}
      WHEN 'unassigned'::missions_status_enum THEN 0
      WHEN 'assigned'::missions_status_enum THEN 1
      WHEN 'inProgress'::missions_status_enum THEN 2
      WHEN 'delivered'::missions_status_enum THEN 3
      ELSE 999
    END`;
    const hasRealDriver = sql<boolean>`(${normalizedDriver} IS NOT NULL AND ${normalizedDriver} <> 'Unassigned')`;

    const whereClause = and(
      params.date ? eq(schema.missions.date, params.date as any) : undefined,
      isNull(schema.missions.deletedAt),
      effectiveBranchId
        ? eq(schema.missions.branchId, effectiveBranchId)
        : undefined,
    );

    const orderBys: any[] = [];

    if (params.groupBy === 'status') {
      const groupDir =
        params.sortBy === 'status' && params.sortOrder === 'desc'
          ? desc(statusRank)
          : asc(statusRank);
      orderBys.push(groupDir);
    } else {
      const groupRank = sql<number>`CASE
        WHEN ${effectiveStatus} = 'unassigned'::missions_status_enum THEN 0
        WHEN ${hasRealDriver} THEN 1
        ELSE 2
      END`;
      const driverSortKey = sql<string>`CASE WHEN ${hasRealDriver} THEN ${normalizedDriver} ELSE NULL END`;
      const otherStatusRank = sql<number>`CASE WHEN NOT ${hasRealDriver} THEN ${statusRank} ELSE NULL END`;

      orderBys.push(asc(groupRank));
      orderBys.push(asc(driverSortKey));
      orderBys.push(asc(otherStatusRank));
    }

    const customerNameLower = sql<string>`lower(${schema.missions.customerName})`;

    if (params.sortBy === 'timeWindow') {
      orderBys.push(
        isDesc
          ? desc(schema.missions.startTimeWindow)
          : asc(schema.missions.startTimeWindow),
      );
      orderBys.push(isDesc ? desc(customerNameLower) : asc(customerNameLower));
      orderBys.push(
        isDesc ? desc(schema.missions.id) : asc(schema.missions.id),
      );
    } else if (params.sortBy === 'customerName') {
      orderBys.push(isDesc ? desc(customerNameLower) : asc(customerNameLower));
      orderBys.push(
        isDesc
          ? desc(schema.missions.startTimeWindow)
          : asc(schema.missions.startTimeWindow),
      );
      orderBys.push(
        isDesc ? desc(schema.missions.id) : asc(schema.missions.id),
      );
    } else {
      orderBys.push(isDesc ? desc(statusRank) : asc(statusRank));
      orderBys.push(
        isDesc
          ? desc(schema.missions.startTimeWindow)
          : asc(schema.missions.startTimeWindow),
      );
      orderBys.push(isDesc ? desc(customerNameLower) : asc(customerNameLower));
      orderBys.push(
        isDesc ? desc(schema.missions.id) : asc(schema.missions.id),
      );
    }

    return this.db
      .select()
      .from(schema.missions)
      .where(whereClause)
      .orderBy(...orderBys) as any;
  }

  async findOneById(id: string): Promise<MissionResponseDto | null> {
    // Admins can access missions from any branch
    const effectiveBranchId = this.ctx.getEffectiveBranchId(undefined);

    const row = await this.db.query.missions.findFirst({
      with: {
        company: true,
        branch: true,
        createdBy: true,
      },
      where: (missions, { and, eq, isNull }) =>
        and(
          eq(missions.id, id),
          isNull(missions.deletedAt),
          effectiveBranchId
            ? eq(missions.branchId, effectiveBranchId)
            : undefined,
        ),
    });

    return (row as any) ?? null;
  }

  findBranchWithinCompany(
    branchId: string,
    companyId: string,
  ): Promise<BranchResponseDto | null> {
    return this.db.query.branches.findFirst({
      where: (branches, { and, eq, isNull }) =>
        and(
          eq(branches.id, branchId),
          eq(branches.companyId, companyId),
          isNull(branches.deletedAt),
        ),
    }) as any as Promise<BranchResponseDto | null>;
  }

  findVehicleWithinCompany(
    vehicleId: string,
    companyId: string,
  ): Promise<VehicleResponseDto | null> {
    return this.db.query.vehicles.findFirst({
      where: (vehicles, { and, eq, isNull }) =>
        and(
          eq(vehicles.id, vehicleId),
          eq(vehicles.companyId, companyId),
          isNull(vehicles.deletedAt),
        ),
    }) as any as Promise<VehicleResponseDto | null>;
  }

  create(data: Partial<MissionResponseDto>) {
    return data as any;
  }

  async save(mission: MissionResponseDto): Promise<MissionResponseDto | null> {
    if (!mission.companyId) {
      throw new Error('Mission companyId is required');
    }

    const values: any = {
      companyId: mission.companyId,
      branchId: mission.branchId ?? null,
      date: mission.date,
      customerName: mission.customerName,
      phone: mission.phone,
      address: mission.address,
      routeId: mission.routeId ?? null,
      latitude: mission.latitude,
      longitude: mission.longitude,
      deliveryTime: mission.deliveryTime ?? null,
      startTimeWindow: mission.startTimeWindow,
      endTimeWindow: mission.endTimeWindow,
      assignmentId: mission.assignmentId ?? null,
      driverId: (mission as any).driverId ?? null,
      driverName: (mission as any).driverName ?? null,
      vehicleId: mission.vehicleId ?? null,
      vehiclePlate: (mission as any).vehiclePlate ?? null,
      status: mission.status,
      createdById: mission.createdById ?? null,
      updatedAt: new Date(),
    };

    if (mission.id) {
      const [updated] = await this.db
        .update(schema.missions)
        .set(values)
        .where(
          and(
            eq(schema.missions.id, mission.id),
            isNull(schema.missions.deletedAt),
          ),
        )
        .returning({ id: schema.missions.id });

      if (!updated) return null;
      return this.findOneById(updated.id);
    }

    const [created] = await this.db
      .insert(schema.missions)
      .values({
        ...values,
        createdAt: new Date(),
      })
      .returning({ id: schema.missions.id });

    return this.findOneById(created.id);
  }

  async remove(
    mission: MissionResponseDto,
  ): Promise<MissionResponseDto | null> {
    const [deleted] = await this.db
      .update(schema.missions)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(schema.missions.id, mission.id),
          isNull(schema.missions.deletedAt),
        ),
      )
      .returning({ id: schema.missions.id });

    if (!deleted) return null;
    return mission;
  }
}
