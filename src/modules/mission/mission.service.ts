import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { RequestContextService } from '../../common/request-context/request-context.service';
import { VroomService } from '../../common/vroom/vroom.service';
import type { JwtUser } from '../core/auth/shared/interfaces/jwt-user.interface';
import { CompanyBalanceService } from '../core/company-balance/company-balance.service';
import { CreateMissionRequestDto } from './dto/create-mission.request.dto';
import { MissionStatus } from './dto/mission-status.enum';
import type { MissionResponseDto } from './dto/mission.response.dto';
import { MissionPlanRouteRequestDto } from './dto/plan-route.request.dto';
import type { UpdateMissionRequestDto } from './dto/update-mission.request.dto';
import { MissionRepository } from './mission.repository';

type DistributionViewSortBy = 'timeWindow' | 'customerName' | 'status';
type DistributionViewSortOrder = 'asc' | 'desc';
type DistributionViewGroupBy = 'driver' | 'status';

type DistributionViewGroup = {
  key: string;
  missions: MissionResponseDto[];
};

const STATUS_GROUP_PREFIX = '__status__:';

const STATUS_ORDER: MissionStatus[] = [
  MissionStatus.UNASSIGNED,
  MissionStatus.ASSIGNED,
  MissionStatus.IN_PROGRESS,
  MissionStatus.DELIVERED,
];

function normalizeDriverName(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function getEffectiveStatus(mission: MissionResponseDto): MissionStatus {
  const raw = (mission.status ?? MissionStatus.UNASSIGNED) as MissionStatus;
  const hasDriver =
    !!mission.driverId || normalizeDriverName(mission.driverName);
  if (raw === MissionStatus.UNASSIGNED && hasDriver)
    return MissionStatus.ASSIGNED;
  return raw;
}

function getStatusGroup(key: string): MissionStatus | null {
  if (!key.startsWith(STATUS_GROUP_PREFIX)) return null;
  const status = key.slice(STATUS_GROUP_PREFIX.length) as MissionStatus;
  if (STATUS_ORDER.includes(status)) return status;
  return null;
}

function safeTime(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  const dt = new Date(String(value));
  const ms = dt.getTime();
  return Number.isFinite(ms) ? ms : Number.POSITIVE_INFINITY;
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  const mustQuote = /[",\n\r]/.test(str);
  const escaped = str.replace(/"/g, '""');
  return mustQuote ? `"${escaped}"` : escaped;
}

function parseCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = i + 1 < text.length ? text[i + 1] : '';

    if (ch === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && ch === ',') {
      row.push(field);
      field = '';
      continue;
    }

    if (!inQuotes && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && next === '\n') {
        i += 1;
      }
      row.push(field);
      field = '';
      const isEmptyLine = row.every((c) => c.trim() === '');
      if (!isEmptyLine) rows.push(row);
      row = [];
      continue;
    }

    field += ch;
  }

  row.push(field);
  if (!row.every((c) => c.trim() === '')) rows.push(row);
  if (!rows.length) return [];

  const headers = rows[0].map((h) => h.trim());
  const data = rows.slice(1);
  return data
    .filter((r) => r.some((c) => c.trim() !== ''))
    .map((r) => {
      const record: Record<string, string> = {};
      for (let i = 0; i < headers.length; i += 1) {
        record[headers[i]] = (r[i] ?? '').trim();
      }
      return record;
    });
}

function parseLocation(record: Record<string, string>): string | null {
  const raw = record.location || '';
  if (raw) {
    const cleaned = raw.replace(/\[/g, '').replace(/\]/g, '').trim();
    const parts = cleaned.split(',').map((s) => s.trim());
    if (parts.length === 2) {
      const lng = Number(parts[0]);
      const lat = Number(parts[1]);
      if (Number.isFinite(lng) && Number.isFinite(lat)) {
        return `${lng},${lat}`;
      }
    }
  }

  const lng = Number(record.longitude ?? record.lng);
  const lat = Number(record.latitude ?? record.lat);
  if (Number.isFinite(lng) && Number.isFinite(lat)) {
    return `${lng},${lat}`;
  }

  return null;
}

function distance(a: [number, number], b: [number, number]): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return Math.sqrt(dx * dx + dy * dy);
}

@Injectable()
export class MissionService {
  private readonly logger = new Logger(MissionService.name);

  constructor(
    private readonly missions: MissionRepository,
    private readonly ctx: RequestContextService,
    private readonly companyBalance: CompanyBalanceService,
    private readonly vroomService: VroomService,
  ) {}

  async create(dto: CreateMissionRequestDto, user: JwtUser) {
    const companyId = this.ctx.requireCompanyId();
    let branchIdToAssign = user.branchId?.trim()
      ? user.branchId.trim()
      : undefined;

    const requestedBranchId = dto.branchId?.trim()
      ? dto.branchId.trim()
      : undefined;

    if (requestedBranchId) {
      if (!this.ctx.isSuperAdmin() && !this.ctx.isCompanyAdmin()) {
        throw new ForbiddenException(
          'You cannot assign a branch to this mission',
        );
      }

      const branch = await this.missions.findBranchWithinCompany(
        requestedBranchId,
        companyId,
      );
      if (!branch) {
        throw new ForbiddenException('Branch not found in your company');
      }

      branchIdToAssign = branch.id;
    }

    const vehicleId = dto.vehicleId ?? undefined;
    const vehicle = vehicleId
      ? await this.missions.findVehicleWithinCompany(vehicleId, companyId)
      : null;
    if (vehicleId && !vehicle) {
      throw new ForbiddenException('Vehicle not found in your company');
    }

    const [lngStr, latStr] = dto.location.split(',').map((s) => s.trim());
    const longitude = Number(lngStr);
    const latitude = Number(latStr);

    const startTW = new Date(
      `${dto.date}T${dto.startTimeWindow ? dto.startTimeWindow : '00:00'}:00Z`,
    );
    const endTW = new Date(
      `${dto.date}T${dto.endTimeWindow ? dto.endTimeWindow : '23:59'}:00Z`,
    );

    const mission = this.missions.create({
      companyId,
      branchId: branchIdToAssign ?? undefined,
      vehicleId: vehicle?.id ?? undefined,
      date: dto.date,
      customerName: dto.name,
      phone: dto.phone,
      address: dto.address,
      latitude,
      longitude,
      deliveryTime: dto.deliveryTime ?? null,
      startTimeWindow: startTW,
      endTimeWindow: endTW,
      status: dto.status ?? MissionStatus.UNASSIGNED,
      company: { id: companyId } as any,
      branch: branchIdToAssign ? ({ id: branchIdToAssign } as any) : undefined,
      createdById: user.userId,
      createdBy: { id: user.userId } as any,
    });

    await this.companyBalance.consume('mission_create');
    return this.missions.save(mission);
  }

  findAll(user: JwtUser, date?: string, branchId?: string, driverId?: string) {
    return this.missions.findAll(date, branchId, driverId);
  }

  async findDistributionView(
    user: JwtUser,
    params: {
      date?: string;
      branchId?: string;
      sortBy?: string;
      sortOrder?: string;
      groupBy?: string;
    },
  ): Promise<{ groups: DistributionViewGroup[] }> {
    const sortBy: DistributionViewSortBy =
      params.sortBy === 'customerName'
        ? 'customerName'
        : params.sortBy === 'status'
          ? 'status'
          : 'timeWindow';
    const sortOrder: DistributionViewSortOrder =
      params.sortOrder === 'desc' ? 'desc' : 'asc';
    const groupBy: DistributionViewGroupBy =
      params.groupBy === 'status' ? 'status' : 'driver';

    // DB does filtering + ordering; we only partition into groups in a single pass.
    const missions = await this.missions.findDistributionViewOrdered({
      date: params.date,
      branchId: params.branchId,
      sortBy,
      sortOrder,
      groupBy,
    });

    const groups: DistributionViewGroup[] = [];
    let currentKey: string | null = null;
    let currentGroup: DistributionViewGroup | null = null;

    for (const m of missions) {
      const effectiveStatus = getEffectiveStatus(m);
      const normalizedDriver = normalizeDriverName(m.driverName);
      const hasRealDriver =
        !!normalizedDriver && normalizedDriver !== 'Unassigned';

      let key = '';
      if (groupBy === 'status') {
        key = `${STATUS_GROUP_PREFIX}${effectiveStatus}`;
      } else {
        if (effectiveStatus === MissionStatus.UNASSIGNED) {
          key = `${STATUS_GROUP_PREFIX}${MissionStatus.UNASSIGNED}`;
        } else if (hasRealDriver) {
          key = normalizedDriver;
        } else {
          key = `${STATUS_GROUP_PREFIX}${effectiveStatus}`;
        }
      }

      if (key !== currentKey) {
        currentKey = key;
        currentGroup = { key, missions: [] };
        groups.push(currentGroup);
      }

      currentGroup!.missions.push(m);
    }

    if (sortBy !== 'status') {
      const isDesc = sortOrder === 'desc';
      groups.sort((a, b) => {
        const firstA = a.missions[0];
        const firstB = b.missions[0];
        if (!firstA || !firstB) return 0;

        let comparison = 0;
        if (sortBy === 'customerName') {
          const nameA = (firstA.customerName || '').toLowerCase();
          const nameB = (firstB.customerName || '').toLowerCase();
          comparison = nameA.localeCompare(nameB);
        } else if (sortBy === 'timeWindow') {
          const timeA = safeTime(firstA.startTimeWindow);
          const timeB = safeTime(firstB.startTimeWindow);
          comparison = timeA - timeB;
        }

        return isDesc ? -comparison : comparison;
      });
    }

    return { groups };
  }

  async exportCsv(user: JwtUser, date?: string, branchId?: string) {
    const missions = await this.missions.findAll(date, branchId);
    const headers = [
      'id',
      'date',
      'name',
      'phone',
      'address',
      'location',
      'status',
      'vehicleId',
      'branchId',
      'driverId',
      'deliveryTime',
      'startTimeWindow',
      'endTimeWindow',
    ];

    const lines = [headers.join(',')];
    for (const m of missions) {
      const location =
        Number.isFinite(m.longitude) && Number.isFinite(m.latitude)
          ? `${m.longitude},${m.latitude}`
          : '';
      const row = [
        m.id,
        m.date,
        m.customerName,
        m.phone,
        m.address,
        location,
        m.status ?? MissionStatus.UNASSIGNED,
        m.vehicleId,
        m.branchId ?? '',
        (m as any).driverId ?? '',
        m.deliveryTime ?? '',
        m.startTimeWindow ? m.startTimeWindow.toISOString() : '',
        m.endTimeWindow ? m.endTimeWindow.toISOString() : '',
      ].map(csvEscape);
      lines.push(row.join(','));
    }

    return `${lines.join('\n')}\n`;
  }

  async importMissions(
    user: JwtUser,
    file: Express.Multer.File,
    date?: string,
    branchId?: string,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    const text = file.buffer.toString('utf-8').trim();
    if (!text) throw new BadRequestException('Empty file');

    const defaultDate = date;
    const defaultBranchId = branchId?.trim() ? branchId.trim() : undefined;
    const errors: Array<{ row: number; message: string }> = [];
    let createdCount = 0;
    let failedCount = 0;

    const createFromRecord = async (
      record: Record<string, any>,
      rowNumber: number,
    ) => {
      try {
        const rowDate = record.date || defaultDate;
        if (!rowDate) {
          throw new BadRequestException('Missing date');
        }

        const location = parseLocation(record as any);
        if (!location) {
          throw new BadRequestException('Missing or invalid location');
        }

        const vehicleId = record.vehicleId || record.vehicle_id;

        const statusValue = record.status as MissionStatus | undefined;
        const validStatus =
          statusValue && Object.values(MissionStatus).includes(statusValue)
            ? statusValue
            : undefined;

        const recordBranchRaw = record.branchId || record.branch_id;
        const recordBranchId =
          typeof recordBranchRaw === 'string' && recordBranchRaw.trim()
            ? recordBranchRaw.trim()
            : undefined;

        const dto: CreateMissionRequestDto = {
          date: rowDate,
          name: record.name || record.customerName || record.customer || '',
          phone: record.phone || '',
          address: record.address || '',
          location,
          deliveryTime: record.deliveryTime || undefined,
          startTimeWindow: record.startTimeWindow || undefined,
          endTimeWindow: record.endTimeWindow || undefined,
          vehicleId,
          branchId: recordBranchId ?? defaultBranchId,
          status: validStatus,
        };

        if (!dto.name || !dto.phone || !dto.address) {
          throw new BadRequestException('Missing required fields');
        }

        const pgClient = this.ctx.get()?.pgClient;
        if (!pgClient) {
          await this.create(dto, user);
          createdCount += 1;
          return;
        }

        const savepointName = `mission_import_${rowNumber}`;
        await pgClient.query(`SAVEPOINT ${savepointName}`);
        try {
          await this.create(dto, user);
          await pgClient.query(`RELEASE SAVEPOINT ${savepointName}`);
          createdCount += 1;
        } catch (e) {
          await pgClient.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
          await pgClient.query(`RELEASE SAVEPOINT ${savepointName}`);
          throw e;
        }
      } catch (e: any) {
        failedCount += 1;
        if (errors.length < 20) {
          errors.push({
            row: rowNumber,
            message: e?.message || 'Import failed',
          });
        }
      }
    };

    if (text.startsWith('[') || text.startsWith('{')) {
      const parsed = JSON.parse(text);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (let i = 0; i < items.length; i += 1) {
        await createFromRecord(items[i], i + 1);
      }
      return { createdCount, failedCount, errors };
    }

    const records = parseCsv(text);
    for (let i = 0; i < records.length; i += 1) {
      await createFromRecord(records[i], i + 2);
    }
    return { createdCount, failedCount, errors };
  }

  async planRoute(user: JwtUser, dto: MissionPlanRouteRequestDto) {
    const date = dto.date;
    if (!date) throw new BadRequestException('Missing date');

    const missions = await this.missions.findAll(date, dto.branchId);
    const missionIdSet = dto.missionIds?.length
      ? new Set(dto.missionIds)
      : null;

    const candidates = missions
      .filter((m) => {
        if (!Number.isFinite(m.longitude) || !Number.isFinite(m.latitude)) {
          return false;
        }
        if (missionIdSet && !missionIdSet.has(m.id)) {
          return false;
        }
        return true;
      })
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

    const mode = dto.mode ?? 'auto';

    if (mode === 'auto') {
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
              { start: c.startTimeWindow, end: c.endTimeWindow },
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
          `VROOM optimized ${candidates.length} missions: ${Math.round(
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
          'VROOM optimization failed, falling back to manual',
          error,
        );
      }
    }

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
      ordered.push(best);
      remaining.delete(best.id);
      current = best;
    }

    const orderedMissionIds = ordered.map((m) => m.id);
    const coordinates = ordered.map((m) => m.coord);

    let geometry = null;
    let totalDistanceMeters = 0;
    let totalDurationSeconds = 0;

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
    }

    return {
      date,
      orderedMissionIds,
      geometry,
      totalDistanceMeters,
      totalDurationSeconds,
    };
  }

  async findOne(id: string, user: JwtUser) {
    const mission = await this.missions.findOneById(id);

    if (!mission) {
      throw new NotFoundException('Mission not found');
    }

    return mission;
  }

  async update(id: string, dto: UpdateMissionRequestDto, user: JwtUser) {
    const mission = await this.missions.findOneById(id);

    if (!mission) {
      throw new NotFoundException('Mission not found or access denied');
    }

    if (dto.branchId) {
      if (!this.ctx.isSuperAdmin() && !this.ctx.isCompanyAdmin()) {
        throw new ForbiddenException(
          'You cannot change the branch of this mission',
        );
      }

      const branch = await this.missions.findBranchWithinCompany(
        dto.branchId,
        this.ctx.requireCompanyId(),
      );
      if (!branch) {
        throw new ForbiddenException('Branch not found in your company');
      }
      mission.branchId = branch.id;
      mission.branch = branch;
    }

    if (dto.vehicleId) {
      const vehicle = await this.missions.findVehicleWithinCompany(
        dto.vehicleId,
        this.ctx.requireCompanyId(),
      );
      if (!vehicle) {
        throw new ForbiddenException('Vehicle not found in your company');
      }
      mission.vehicleId = vehicle.id;
    } else if (dto.clearVehicle) {
      mission.vehicleId = null as any;
    }

    const shouldDetachFromRoute =
      dto.clearVehicle === true || dto.status === MissionStatus.UNASSIGNED;

    if (shouldDetachFromRoute) {
      // Unassigning implies it should no longer be part of an optimized route.
      mission.routeId = null as any;
      mission.assignmentId = null as any;
      (mission as any).driverId = null;
      (mission as any).driverName = null;
      (mission as any).vehiclePlate = null;
      if (dto.clearVehicle) {
        mission.vehicleId = null as any;
      }
    }

    if (dto.date) {
      mission.date = dto.date;
    }
    if (dto.name) {
      mission.customerName = dto.name;
    }
    if (dto.phone) {
      mission.phone = dto.phone;
    }
    if (dto.address) {
      mission.address = dto.address;
    }
    if (dto.location) {
      const [lngStr, latStr] = dto.location.split(',').map((s) => s.trim());
      mission.longitude = Number(lngStr);
      mission.latitude = Number(latStr);
    }
    if (dto.deliveryTime !== undefined) {
      mission.deliveryTime = dto.deliveryTime ?? null;
    }
    if (dto.status) {
      mission.status = dto.status;
    }
    if (dto.startTimeWindow || dto.endTimeWindow) {
      const baseDate = dto.date ?? mission.date;
      if (dto.startTimeWindow) {
        mission.startTimeWindow = new Date(
          `${baseDate}T${dto.startTimeWindow}:00Z`,
        );
      }
      if (dto.endTimeWindow) {
        mission.endTimeWindow = new Date(
          `${baseDate}T${dto.endTimeWindow}:00Z`,
        );
      }
    }

    return this.ctx.runInTransaction(async () => {
      if (shouldDetachFromRoute) {
        await this.missions.detachMissionsFromRoutes([id]);
      }

      const saved = await this.missions.save(mission);
      return saved;
    });
  }

  async remove(id: string, user: JwtUser) {
    const mission = await this.missions.findOneById(id);

    if (!mission) {
      throw new NotFoundException('Mission not found or access denied');
    }

    await this.missions.remove(mission);
    return { message: 'Mission deleted successfully' };
  }
}
