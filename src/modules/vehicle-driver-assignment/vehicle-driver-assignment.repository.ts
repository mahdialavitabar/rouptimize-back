import { Injectable } from '@nestjs/common';
import { SQL, and, eq, isNull } from 'drizzle-orm';
import { RequestContextService } from '../../common/request-context/request-context.service';
import * as schema from '../../db/schema';
import { DriverResponseDto } from '../driver/dto/driver.response.dto';
import { VehicleResponseDto } from '../vehicle/dto/vehicle.response.dto';
import { VehicleDriverAssignmentResponseDto } from './dto/vehicle-driver-assignment.response.dto';

@Injectable()
export class VehicleDriverAssignmentRepository {
  constructor(private readonly ctx: RequestContextService) {}

  private get db() {
    return this.ctx.getDb();
  }

  findAll(from?: Date, to?: Date) {
    return this.db.query.vehicleDriverAssignments.findMany({
      with: {
        driver: true,
        vehicle: true,
      },
      where: (assignments, { and, isNull, lt, gt, or }) => {
        const conditions: SQL[] = [isNull(assignments.deletedAt)];

        if (from && to) {
          // Overlap logic: (Start < To) AND (End > From OR End IS NULL)
          conditions.push(
            and(
              lt(assignments.startDate, to),
              or(gt(assignments.endDate, from), isNull(assignments.endDate)),
            )!,
          );
        }

        return and(...conditions);
      },
    }) as any;
  }

  async findOverlappingAssignment(
    driverId: string,
    vehicleId: string,
    startDate: Date,
    endDate?: Date,
    excludeId?: string,
  ) {
    const row = await this.db.query.vehicleDriverAssignments.findFirst({
      where: (assignments, { and, eq, isNull, lt, gt, or, ne }) => {
        const conditions: SQL[] = [
          isNull(assignments.deletedAt),
          // Check if driver OR vehicle is already assigned
          or(
            eq(assignments.driverId, driverId),
            eq(assignments.vehicleId, vehicleId),
          )!,
          // Overlap logic:
          // (ExistingEnd > NewStart OR ExistingEnd IS NULL)
          or(gt(assignments.endDate, startDate), isNull(assignments.endDate))!,
        ];

        // (ExistingStart < NewEnd) - only if NewEnd is not null (finite)
        if (endDate) {
          conditions.push(lt(assignments.startDate, endDate));
        }

        if (excludeId) {
          conditions.push(ne(assignments.id, excludeId));
        }

        return and(...conditions);
      },
      with: {
        driver: true,
        vehicle: true,
      },
    });

    return (row as any) ?? null;
  }

  async findOneById(id: string) {
    const row = await this.db.query.vehicleDriverAssignments.findFirst({
      with: {
        driver: true,
        vehicle: true,
      },
      where: (assignments, { and, eq, isNull }) =>
        and(eq(assignments.id, id), isNull(assignments.deletedAt)),
    });

    return (row as any) ?? null;
  }

  async findCurrentAssignmentByDriverId(driverId: string) {
    const now = new Date();
    const row = await this.db.query.vehicleDriverAssignments.findFirst({
      with: {
        driver: true,
        vehicle: true,
      },
      where: (assignments, { and, eq, isNull, lte, or, gte }) =>
        and(
          eq(assignments.driverId, driverId),
          isNull(assignments.deletedAt),
          lte(assignments.startDate, now),
          or(isNull(assignments.endDate), gte(assignments.endDate, now)),
        ),
    });

    return (row as any) ?? null;
  }

  findVehicleForAssignment(vehicleId: string) {
    return this.db.query.vehicles.findFirst({
      where: (vehicles, { and, eq, isNull }) =>
        and(eq(vehicles.id, vehicleId), isNull(vehicles.deletedAt)),
    }) as any as Promise<VehicleResponseDto | null>;
  }

  findDriverForAssignment(driverId: string) {
    return this.db.query.drivers.findFirst({
      where: (drivers, { and, eq, isNull }) =>
        and(eq(drivers.id, driverId), isNull(drivers.deletedAt)),
    }) as any as Promise<DriverResponseDto | null>;
  }

  create(data: Partial<VehicleDriverAssignmentResponseDto>) {
    return data as any;
  }

  async save(assignment: VehicleDriverAssignmentResponseDto) {
    const values: any = {
      companyId: assignment.companyId,
      branchId: assignment.branchId ?? null,
      driverId: assignment.driverId,
      vehicleId: assignment.vehicleId,
      startDate: assignment.startDate,
      endDate: assignment.endDate ?? null,
      deletedAt: (assignment as any).deletedAt ?? null,
      updatedAt: new Date(),
    };

    if (assignment.id) {
      const [updated] = await this.db
        .update(schema.vehicleDriverAssignments)
        .set(values)
        .where(
          and(
            eq(schema.vehicleDriverAssignments.id, assignment.id),
            isNull(schema.vehicleDriverAssignments.deletedAt),
          ),
        )
        .returning({ id: schema.vehicleDriverAssignments.id });

      if (!updated) return null;
      return this.findOneById(updated.id);
    }

    const [created] = await this.db
      .insert(schema.vehicleDriverAssignments)
      .values({
        ...values,
        createdAt: new Date(),
      })
      .returning({ id: schema.vehicleDriverAssignments.id });

    return this.findOneById(created.id);
  }

  async remove(assignment: VehicleDriverAssignmentResponseDto) {
    const [deleted] = await this.db
      .update(schema.vehicleDriverAssignments)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(schema.vehicleDriverAssignments.id, assignment.id),
          isNull(schema.vehicleDriverAssignments.deletedAt),
        ),
      )
      .returning({ id: schema.vehicleDriverAssignments.id });

    if (!deleted) return null;
    return assignment;
  }

  async findActiveAssignment(vehicleId: string, date: string) {
    const at = new Date(`${date}T00:00:00.000Z`);

    return this.db.query.vehicleDriverAssignments.findFirst({
      where: (assignments, { and, eq, isNull, lte, or, gte }) =>
        and(
          eq(assignments.vehicleId, vehicleId),
          isNull(assignments.deletedAt),
          lte(assignments.startDate, at),
          or(isNull(assignments.endDate), gte(assignments.endDate, at)),
        ),
    }) as any as Promise<VehicleDriverAssignmentResponseDto | null>;
  }
}
