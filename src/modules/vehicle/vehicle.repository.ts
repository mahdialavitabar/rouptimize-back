import { Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { RequestContextService } from '../../common/request-context/request-context.service';
import * as schema from '../../db/schema';
import { BranchResponseDto } from '../branch/dto/branch.response.dto';
import { VehicleResponseDto } from './dto/vehicle.response.dto';

@Injectable()
export class VehicleRepository {
  constructor(private readonly ctx: RequestContextService) {}

  private get db() {
    return this.ctx.getDb();
  }

  findAll(branchId?: string) {
    const effectiveBranchId = this.ctx.getEffectiveBranchId(branchId);

    return this.db.query.vehicles.findMany({
      with: {
        company: true,
        branch: true,
        createdBy: true,
      },
      where: (vehicles, { and, eq, isNull }) =>
        and(
          isNull(vehicles.deletedAt),
          effectiveBranchId
            ? eq(vehicles.branchId, effectiveBranchId)
            : undefined,
        ),
    }) as any;
  }

  async findOneById(id: string) {
    const row = await this.db.query.vehicles.findFirst({
      with: {
        company: true,
        branch: true,
        createdBy: true,
      },
      where: (vehicles, { and, eq, isNull }) =>
        and(eq(vehicles.id, id), isNull(vehicles.deletedAt)),
    });

    return (row as any) ?? null;
  }

  findBranchWithinCompany(branchId: string, companyId: string) {
    return this.db.query.branches.findFirst({
      where: (branches, { and, eq, isNull }) =>
        and(
          eq(branches.id, branchId),
          eq(branches.companyId, companyId),
          isNull(branches.deletedAt),
        ),
    }) as any as Promise<BranchResponseDto | null>;
  }

  create(data: Partial<VehicleResponseDto>) {
    return data as any;
  }

  async save(vehicle: VehicleResponseDto) {
    const values: any = {
      vin: vehicle.vin,
      plateNumber: vehicle.plateNumber,
      model: vehicle.model ?? null,
      year: vehicle.year ?? null,
      type: vehicle.type ?? null,
      startWorkingTime: vehicle.startWorkingTime ?? null,
      endWorkingTime: vehicle.endWorkingTime ?? null,
      weightCapacity: vehicle.weightCapacity ?? null,
      volumeCapacity: vehicle.volumeCapacity ?? null,
      missionCapacity: vehicle.missionCapacity ?? null,
      skills: vehicle.skills ?? [],
      costPerKm: vehicle.costPerKm ?? '0',
      costPerHour: vehicle.costPerHour ?? '0',
      startPoint: vehicle.startPoint ?? null,
      endPoint: vehicle.endPoint ?? null,
      status: vehicle.status ?? 'active',
      color: vehicle.color ?? null,
      companyId: vehicle.companyId,
      branchId: vehicle.branchId ?? null,
      createdById: vehicle.createdById ?? null,
      deletedAt: vehicle.deletedAt ?? null,
      updatedAt: new Date(),
    };

    if (vehicle.id) {
      const [updated] = await this.db
        .update(schema.vehicles)
        .set(values)
        .where(
          and(
            eq(schema.vehicles.id, vehicle.id),
            isNull(schema.vehicles.deletedAt),
          ),
        )
        .returning({ id: schema.vehicles.id });

      if (!updated) {
        return null;
      }

      return this.findOneById(updated.id);
    }

    const [created] = await this.db
      .insert(schema.vehicles)
      .values({
        ...values,
        createdAt: new Date(),
      })
      .returning({ id: schema.vehicles.id });

    return this.findOneById(created.id);
  }

  async remove(vehicle: VehicleResponseDto) {
    const [deleted] = await this.db
      .update(schema.vehicles)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(schema.vehicles.id, vehicle.id),
          isNull(schema.vehicles.deletedAt),
        ),
      )
      .returning({ id: schema.vehicles.id });

    if (!deleted) {
      return null;
    }

    return vehicle;
  }
}
