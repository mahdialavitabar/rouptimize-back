import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { RequestContextService } from '../../common/request-context/request-context.service';
import { VroomService } from '../../common/vroom/vroom.service';
import { MissionRepository } from '../mission/mission.repository';
import { VehicleDriverAssignmentRepository } from '../vehicle-driver-assignment/vehicle-driver-assignment.repository';
import { AddMissionsRequestDto } from './dto/add-missions.request.dto';
import { AssignVehicleRequestDto } from './dto/assign-vehicle.request.dto';
import { CreateRouteRequestDto } from './dto/create-route.request.dto';
import { RoutePlanRouteRequestDto } from './dto/plan-route.request.dto';
import { RouteRepository } from './route.repository';

function toRad(x: number): number {
  return (x * Math.PI) / 180;
}

function haversineDistance(a: [number, number], b: [number, number]): number {
  const R = 6371e3;
  const φ1 = toRad(a[1]);
  const φ2 = toRad(b[1]);
  const Δφ = toRad(b[1] - a[1]);
  const Δλ = toRad(b[0] - a[0]);

  const aVal =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(aVal), Math.sqrt(1 - aVal));

  return R * c;
}

function distance(a: [number, number], b: [number, number]): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return Math.sqrt(dx * dx + dy * dy);
}

@Injectable()
export class RouteService {
  private readonly logger = new Logger(RouteService.name);

  constructor(
    private readonly routeRepo: RouteRepository,
    private readonly missionRepo: MissionRepository,
    private readonly assignmentRepo: VehicleDriverAssignmentRepository,
    private readonly ctx: RequestContextService,
    private readonly vroomService: VroomService,
  ) {}

  async plan(dto: RoutePlanRouteRequestDto) {
    const { date, missionIds, mode = 'auto' } = dto;

    const missions = await this.missionRepo.findByIds(missionIds);

    const candidates = missions
      .filter(
        (m) => Number.isFinite(m.longitude) && Number.isFinite(m.latitude),
      )
      .map((m) => ({
        id: m.id,
        coord: [m.longitude, m.latitude] as [number, number],
        startTimeWindow: m.startTimeWindow,
        endTimeWindow: m.endTimeWindow,
      }));

    if (!candidates.length) {
      return {
        date,
        orderedMissionIds: [],
        geometry: null,
        totalDistanceMeters: 0,
        totalDurationSeconds: 0,
      };
    }

    if (mode === 'auto') {
      return this.planWithVroom(date, candidates);
    }

    return this.planManual(date, candidates);
  }

  private async planWithVroom(
    date: string,
    candidates: Array<{
      id: string;
      coord: [number, number];
      startTimeWindow?: Date | null;
      endTimeWindow?: Date | null;
    }>,
  ) {
    try {
      const vroomJobs = candidates.map((c) => {
        const job: {
          id: string;
          location: [number, number];
          service: number;
          timeWindows?: Array<{ start: Date; end: Date }>;
        } = {
          id: c.id,
          location: c.coord,
          service: 300,
        };

        if (c.startTimeWindow && c.endTimeWindow) {
          job.timeWindows = [
            {
              start: c.startTimeWindow,
              end: c.endTimeWindow,
            },
          ];
        }

        return job;
      });

      const result = await this.vroomService.optimizeSingleVehicleRoute(
        vroomJobs,
        candidates[0].coord,
        undefined,
      );

      const orderedMissionIds = result.orderedJobIds;
      const idToCandidate = new Map(candidates.map((c) => [c.id, c]));
      const orderedCoordinates = orderedMissionIds
        .map((id) => idToCandidate.get(id)?.coord)
        .filter((c): c is [number, number] => c !== undefined);

      let geometry = null;
      let totalDistanceMeters = result.totalDistance;
      let totalDurationSeconds = result.totalDuration;

      if (orderedCoordinates.length >= 2) {
        const osrmRoute =
          await this.vroomService.fetchRouteGeometry(orderedCoordinates);
        if (osrmRoute) {
          geometry = {
            type: 'Feature' as const,
            geometry: osrmRoute.geometry,
            properties: { mode: 'auto' },
          };
          totalDistanceMeters = osrmRoute.distance;
          totalDurationSeconds = osrmRoute.duration;
        } else {
          geometry = {
            type: 'Feature' as const,
            geometry: {
              type: 'LineString' as const,
              coordinates: orderedCoordinates,
            },
            properties: { mode: 'auto' },
          };
        }
      }

      this.logger.log(
        `VROOM optimized ${candidates.length} stops: ${Math.round(
          totalDistanceMeters / 1000,
        )}km, ${Math.round(totalDurationSeconds / 60)}min`,
      );

      return {
        date,
        orderedMissionIds,
        geometry,
        totalDistanceMeters: Math.round(totalDistanceMeters),
        totalDurationSeconds: Math.round(totalDurationSeconds),
      };
    } catch (error) {
      this.logger.warn(
        'VROOM optimization failed, falling back to manual planning',
        error,
      );
      return this.planManual(date, candidates);
    }
  }

  private async planManual(
    date: string,
    candidates: Array<{
      id: string;
      coord: [number, number];
      startTimeWindow?: Date | null;
      endTimeWindow?: Date | null;
    }>,
  ) {
    const sortedByStart = [...candidates].sort((a, b) => {
      const av = a.startTimeWindow?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const bv = b.startTimeWindow?.getTime() ?? Number.MAX_SAFE_INTEGER;
      if (av !== bv) return av - bv;
      return a.id.localeCompare(b.id);
    });

    const remaining = new Map(sortedByStart.map((m) => [m.id, m] as const));
    const ordered: typeof sortedByStart = [];

    let current = sortedByStart[0];
    ordered.push(current);
    remaining.delete(current.id);

    let totalDistance = 0;

    while (remaining.size) {
      let best: typeof current | null = null;
      let bestDist = Number.POSITIVE_INFINITY;

      for (const next of remaining.values()) {
        const d = distance(current.coord, next.coord);
        if (d < bestDist) {
          bestDist = d;
          best = next;
        }
      }

      if (!best) break;

      totalDistance += haversineDistance(current.coord, best.coord);

      ordered.push(best);
      remaining.delete(best.id);
      current = best;
    }

    const orderedMissionIds = ordered.map((m) => m.id);
    const coordinates = ordered.map((m) => m.coord);

    let geometry = null;
    let totalDistanceMeters = Math.round(totalDistance);
    const averageSpeedMps = 8.33; // ~30 km/h in city
    let totalDurationSeconds = Math.round(totalDistance / averageSpeedMps);

    if (coordinates.length >= 2) {
      const osrmRoute = await this.vroomService.fetchRouteGeometry(coordinates);
      if (osrmRoute) {
        geometry = {
          type: 'Feature' as const,
          geometry: osrmRoute.geometry,
          properties: { mode: 'manual' },
        };
        totalDistanceMeters = Math.round(osrmRoute.distance);
        totalDurationSeconds = Math.round(osrmRoute.duration);
      } else {
        geometry = {
          type: 'Feature' as const,
          geometry: { type: 'LineString' as const, coordinates },
          properties: { mode: 'manual' },
        };
      }
    } else if (coordinates.length === 1) {
      // Single mission - create a point geometry and provide estimated values
      // Distance/duration will be calculated dynamically from user's location
      geometry = {
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: coordinates[0] },
        properties: { mode: 'single-stop' },
      };
      // Set placeholder values - actual values depend on driver's starting location
      totalDistanceMeters = 0;
      totalDurationSeconds = 0;
    }

    return {
      date,
      orderedMissionIds,
      geometry,
      totalDistanceMeters,
      totalDurationSeconds,
    };
  }

  async create(createRouteDto: CreateRouteRequestDto) {
    const { date, missionIds } = createRouteDto;
    const name = createRouteDto.name?.trim() || `Route ${date}`;
    const description = createRouteDto.description?.trim() || '';

    const missions = await this.missionRepo.findByIds(missionIds);

    if (missions.length !== missionIds.length) {
      throw new NotFoundException('Some missions not found');
    }

    let branchId: string | undefined;

    if (missions.length > 0) {
      const firstBranchId = missions[0].branchId;
      const allSameBranch = missions.every((m) => m.branchId === firstBranchId);

      if (!allSameBranch) {
        throw new BadRequestException(
          'All missions must belong to the same branch',
        );
      }
      branchId = firstBranchId;
    }

    const allSameDate = missions.every((m) => m.date === date);
    if (!allSameDate) {
      throw new BadRequestException(
        'All missions must belong to the route date',
      );
    }

    const planResult = await this.plan({
      date,
      missionIds,
      branchId,
      mode: 'manual',
    });

    return this.ctx.runInTransaction(async () => {
      const route = await this.routeRepo.save({
        date,
        companyId: this.ctx.requireCompanyId(),
        branchId,
        name,
        description,
        geometry: planResult.geometry,
        totalDistanceMeters: planResult.totalDistanceMeters,
        totalDurationSeconds: planResult.totalDurationSeconds,
        status: 'planned',
        missions: [],
      } as any);

      const previousRouteIds = new Set<string>();
      missions.forEach((m) => {
        if (m.routeId) previousRouteIds.add(m.routeId);
      });

      await this.routeRepo.removeMissionsFromRoutes(missionIds);
      await this.missionRepo.updateMissionsRoute(missionIds, route.id);
      await this.routeRepo.setMissions(route.id, planResult.orderedMissionIds);

      for (const oldRouteId of previousRouteIds) {
        if (oldRouteId === route.id) continue;

        const oldRoute =
          await this.routeRepo.findOneWithRelationsById(oldRouteId);
        if (!oldRoute) continue;

        if (!oldRoute.missions || oldRoute.missions.length === 0) {
          await this.routeRepo.delete(oldRouteId);
        } else {
          const remainingMissionIds = oldRoute.missions.map((m) => m.id);
          const newPlan = await this.plan({
            date: oldRoute.date,
            missionIds: remainingMissionIds,
            branchId: oldRoute.branchId,
            mode: 'manual',
          });

          oldRoute.geometry = newPlan.geometry;
          oldRoute.totalDistanceMeters = newPlan.totalDistanceMeters;
          oldRoute.totalDurationSeconds = newPlan.totalDurationSeconds;
          await this.routeRepo.save(oldRoute);
          await this.routeRepo.setMissions(
            oldRouteId,
            newPlan.orderedMissionIds,
          );
        }
      }

      return route;
    });
  }

  async findAll(
    branchId?: string,
    date?: string,
    driverId?: string,
    vehicleId?: string,
  ) {
    return this.routeRepo.findAllWithRelations(
      branchId,
      date,
      driverId,
      vehicleId,
    );
  }

  async findOne(id: string) {
    const route = await this.routeRepo.findOneWithRelationsById(id);

    if (!route) {
      throw new NotFoundException('Route not found');
    }

    return route;
  }

  async assignVehicle(id: string, assignVehicleDto: AssignVehicleRequestDto) {
    const route = await this.findOne(id);
    const { vehicleId } = assignVehicleDto;

    route.vehicleId = vehicleId;

    const assignment = await this.assignmentRepo.findActiveAssignment(
      vehicleId,
      route.date,
    );

    if (assignment) {
      route.driverId = assignment.driverId;
    } else {
      route.driverId = undefined;
    }

    const savedRoute = await this.routeRepo.save(route);

    if (savedRoute.missions && savedRoute.missions.length > 0) {
      const missionIds = savedRoute.missions.map((m) => m.id);

      const vehicleId = savedRoute.vehicleId;
      const vehiclePlate = savedRoute.vehicle?.plateNumber;
      const driverId = savedRoute.driverId;
      const driverName = savedRoute.driver?.name;

      await this.missionRepo.updateAssignment(missionIds, {
        vehicleId,
        vehiclePlate,
        driverId,
        driverName,
      });
    }

    return savedRoute;
  }

  async addMissions(id: string, dto: AddMissionsRequestDto) {
    const route = await this.findOne(id);
    const { missionIds } = dto;

    if (!missionIds.length) {
      throw new BadRequestException('At least one mission is required');
    }

    const missions = await this.missionRepo.findByIds(missionIds);

    if (missions.length !== missionIds.length) {
      throw new NotFoundException('Some missions not found');
    }

    const allSameDate = missions.every((m) => m.date === route.date);
    if (!allSameDate) {
      throw new BadRequestException(
        'All missions must belong to the route date',
      );
    }

    if (route.branchId) {
      const allSameBranch = missions.every(
        (m) => m.branchId === route.branchId,
      );
      if (!allSameBranch) {
        throw new BadRequestException(
          'All missions must belong to the same branch as the route',
        );
      }
    }

    return this.ctx.runInTransaction(async () => {
      const previousRouteIds = new Set<string>();
      missions.forEach((m) => {
        if (m.routeId && m.routeId !== id) previousRouteIds.add(m.routeId);
      });

      await this.routeRepo.removeMissionsFromRoutes(missionIds);

      const existingMissionIds = route.missions?.map((m) => m.id) ?? [];
      const allMissionIds = [...existingMissionIds, ...missionIds];

      await this.missionRepo.updateMissionsRoute(missionIds, route.id);

      const newPlan = await this.plan({
        date: route.date,
        missionIds: allMissionIds,
        branchId: route.branchId,
        mode: 'manual',
      });

      route.geometry = newPlan.geometry;
      route.totalDistanceMeters = newPlan.totalDistanceMeters;
      route.totalDurationSeconds = newPlan.totalDurationSeconds;
      await this.routeRepo.save(route);
      await this.routeRepo.setMissions(route.id, newPlan.orderedMissionIds);

      for (const oldRouteId of previousRouteIds) {
        const oldRoute =
          await this.routeRepo.findOneWithRelationsById(oldRouteId);
        if (!oldRoute) continue;

        if (!oldRoute.missions || oldRoute.missions.length === 0) {
          await this.routeRepo.delete(oldRouteId);
        } else {
          const remainingMissionIds = oldRoute.missions.map((m) => m.id);
          const oldPlan = await this.plan({
            date: oldRoute.date,
            missionIds: remainingMissionIds,
            branchId: oldRoute.branchId,
            mode: 'manual',
          });

          oldRoute.geometry = oldPlan.geometry;
          oldRoute.totalDistanceMeters = oldPlan.totalDistanceMeters;
          oldRoute.totalDurationSeconds = oldPlan.totalDurationSeconds;
          await this.routeRepo.save(oldRoute);
          await this.routeRepo.setMissions(
            oldRouteId,
            oldPlan.orderedMissionIds,
          );
        }
      }

      if (route.vehicleId) {
        const vehiclePlate = route.vehicle?.plateNumber;
        const driverId = route.driverId;
        const driverName = route.driver?.name;

        await this.missionRepo.updateAssignment(missionIds, {
          vehicleId: route.vehicleId,
          vehiclePlate,
          driverId,
          driverName,
        });
      }

      return this.findOne(route.id);
    });
  }
}
