import { Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { RequestContextService } from '../../common/request-context/request-context.service';
import * as schema from '../../db/schema';
import { MissionResponseDto } from '../mission/dto/mission.response.dto';
import { RouteResponseDto } from './dto/route.response.dto';

@Injectable()
export class RouteRepository {
  constructor(private readonly ctx: RequestContextService) {}

  private get db() {
    return this.ctx.getDb();
  }

  createForCurrentScope(
    date: string,
    missions: MissionResponseDto[],
    overrideBranchId?: string,
  ): RouteResponseDto {
    const companyId = this.ctx.requireCompanyId();
    const branchId = overrideBranchId ?? this.ctx.branchId();

    return {
      date,
      companyId,
      branchId: branchId ?? undefined,
      missions,
    } as any;
  }

  async findAllWithRelations(
    branchId?: string,
    date?: string,
    driverId?: string,
    vehicleId?: string,
  ): Promise<RouteResponseDto[]> {
    const effectiveBranchId = this.ctx.getEffectiveBranchId(branchId);

    const rows = await this.db.query.routes.findMany({
      with: {
        vehicle: true,
        driver: true,
        routeMissions: {
          with: { mission: true },
          orderBy: (rm, { asc }) => [asc(rm.stopOrder)],
        },
      },
      where: (routes, { and, eq, isNull }) =>
        and(
          isNull(routes.deletedAt),
          effectiveBranchId
            ? eq(routes.branchId, effectiveBranchId)
            : undefined,
          date ? eq(routes.date, date) : undefined,
          driverId ? eq(routes.driverId, driverId) : undefined,
          vehicleId ? eq(routes.vehicleId, vehicleId) : undefined,
        ),
      orderBy: (routes, { desc }) => [desc(routes.createdAt)],
    });

    return rows.map((row) => {
      const missions = row.routeMissions.map((rm) => rm.mission);
      let status = row.status;

      const isDelayed = missions.some((m) => {
        if (!m.startTimeWindow || !m.endTimeWindow) return false;
        return m.startTimeWindow.getTime() > m.endTimeWindow.getTime();
      });

      if (isDelayed) {
        status = 'delayed' as any;
      }

      return {
        ...row,
        status,
        missions,
      };
    }) as any;
  }

  async findOneWithRelationsById(id: string): Promise<RouteResponseDto | null> {
    // Admins can access routes from any branch
    const effectiveBranchId = this.ctx.getEffectiveBranchId(undefined);

    const row = await this.db.query.routes.findFirst({
      with: {
        vehicle: true,
        driver: true,
        routeMissions: {
          with: { mission: true },
          orderBy: (rm, { asc }) => [asc(rm.stopOrder)],
        },
      },
      where: (routes, { and, eq, isNull }) =>
        and(
          eq(routes.id, id),
          isNull(routes.deletedAt),
          effectiveBranchId
            ? eq(routes.branchId, effectiveBranchId)
            : undefined,
        ),
    });

    if (!row) return null;

    const missions = row.routeMissions.map((rm) => rm.mission);
    let status = row.status;

    const isDelayed = missions.some((m) => {
      if (!m.startTimeWindow || !m.endTimeWindow) return false;
      return m.startTimeWindow.getTime() > m.endTimeWindow.getTime();
    });

    if (isDelayed) {
      status = 'delayed' as any;
    }

    return {
      ...row,
      status,
      missions,
    } as any;
  }

  async save(route: RouteResponseDto): Promise<RouteResponseDto> {
    const values: any = {
      companyId: route.companyId,
      branchId: route.branchId ?? null,
      date: route.date,
      name: (route as any).name ?? '',
      description: (route as any).description ?? '',
      status: route.status ?? undefined,
      geometry: route.geometry ?? null,
      totalDistanceMeters: route.totalDistanceMeters ?? null,
      totalDurationSeconds: route.totalDurationSeconds ?? null,
      vehicleId: route.vehicleId ?? null,
      driverId: route.driverId ?? null,
      updatedAt: new Date(),
    };

    if (route.id) {
      const [updated] = await this.db
        .update(schema.routes)
        .set(values)
        .where(
          and(eq(schema.routes.id, route.id), isNull(schema.routes.deletedAt)),
        )
        .returning({ id: schema.routes.id });

      const refreshed = updated
        ? await this.findOneWithRelationsById(updated.id)
        : null;
      return (refreshed ?? route) as any;
    }

    const [created] = await this.db
      .insert(schema.routes)
      .values({
        ...values,
        createdAt: new Date(),
      })
      .returning({ id: schema.routes.id });

    const missionIds = (route.missions ?? [])
      .map((m) => (m as any)?.id)
      .filter(Boolean);
    if (missionIds.length) {
      await this.db
        .update(schema.missions)
        .set({ routeId: created.id, updatedAt: new Date() })
        .where(inArray(schema.missions.id, missionIds as any));
    }

    const refreshed = await this.findOneWithRelationsById(created.id);
    return (refreshed ?? ({ ...route, id: created.id } as any)) as any;
  }

  async setMissions(routeId: string, missionIds: string[]) {
    await this.db
      .delete(schema.routeMissions)
      .where(eq(schema.routeMissions.routeId, routeId));

    if (missionIds.length === 0) return;

    const companyId = this.ctx.requireCompanyId();

    await this.db.insert(schema.routeMissions).values(
      missionIds.map((missionId, index) => ({
        companyId,
        routeId,
        missionId,
        stopOrder: index,
      })),
    );
  }

  async removeMissionsFromRoutes(missionIds: string[]) {
    if (missionIds.length === 0) return;

    await this.db
      .delete(schema.routeMissions)
      .where(inArray(schema.routeMissions.missionId, missionIds));
  }

  async delete(id: string) {
    await this.db
      .update(schema.routes)
      .set({ deletedAt: new Date() })
      .where(eq(schema.routes.id, id));
  }

  async remove(route: RouteResponseDto): Promise<RouteResponseDto | null> {
    const [deleted] = await this.db
      .update(schema.routes)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(eq(schema.routes.id, route.id), isNull(schema.routes.deletedAt)),
      )
      .returning({ id: schema.routes.id });

    if (!deleted) return null;
    return route;
  }
}
