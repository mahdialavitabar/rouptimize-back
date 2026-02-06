import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RequestContextService } from '../../common/request-context/request-context.service';
import type { JwtUser } from '../core/auth/shared/interfaces/jwt-user.interface';
import { CreateVehicleDriverAssignmentRequestDto } from './dto/create-vehicle-driver-assignment.request.dto';
import { UpdateVehicleDriverAssignmentRequestDto } from './dto/update-vehicle-driver-assignment.request.dto';
import { VehicleDriverAssignmentRepository } from './vehicle-driver-assignment.repository';

@Injectable()
export class VehicleDriverAssignmentService {
  constructor(
    private readonly assignments: VehicleDriverAssignmentRepository,
    private readonly ctx: RequestContextService,
  ) {}

  async create(dto: CreateVehicleDriverAssignmentRequestDto, user: JwtUser) {
    const vehicle = await this.assignments.findVehicleForAssignment(
      dto.vehicleId,
    );
    if (!vehicle) {
      throw new ForbiddenException('Vehicle not found or access denied');
    }

    const driver = await this.assignments.findDriverForAssignment(dto.driverId);
    if (!driver) {
      throw new ForbiddenException('Driver not found or access denied');
    }

    const companyId = this.ctx.requireCompanyId();

    const startDate = new Date(dto.startDate);
    const endDate = dto.endDate ? new Date(dto.endDate) : undefined;

    // Check for conflicts
    const conflicting = await this.assignments.findOverlappingAssignment(
      dto.driverId,
      dto.vehicleId,
      startDate,
      endDate,
    );

    if (conflicting) {
      const isDriverConflict = conflicting.driverId === dto.driverId;
      const msg = isDriverConflict
        ? `Driver is already assigned to vehicle ${
            conflicting.vehicle?.plateNumber ?? 'unknown'
          }`
        : `Vehicle is already assigned to driver ${
            conflicting.driver?.name ?? 'unknown'
          }`;
      throw new ConflictException(msg);
    }

    const assignment = this.assignments.create({
      companyId,
      branchId: vehicle.branchId ?? undefined,
      driverId: dto.driverId,
      vehicleId: dto.vehicleId,
      startDate,
      endDate,
      driver: { id: dto.driverId } as any,
      vehicle: { id: dto.vehicleId } as any,
    });

    return this.assignments.save(assignment);
  }

  findAll(user: JwtUser, from?: string, to?: string) {
    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;
    return this.assignments.findAll(fromDate, toDate);
  }

  async findMyAssignment(user: JwtUser) {
    if (!user.driverId) {
      throw new NotFoundException('User is not a driver');
    }
    const assignment = await this.assignments.findCurrentAssignmentByDriverId(
      user.driverId,
    );
    if (!assignment) {
      throw new NotFoundException('No active vehicle assignment found');
    }
    return assignment;
  }

  async findOne(id: string, user: JwtUser) {
    const assignment = await this.assignments.findOneById(id);

    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    return assignment;
  }

  async update(
    id: string,
    dto: UpdateVehicleDriverAssignmentRequestDto,
    user: JwtUser,
  ) {
    const assignment = await this.assignments.findOneById(id);

    if (!assignment) {
      throw new NotFoundException('Assignment not found or access denied');
    }

    if (dto.vehicleId) {
      const vehicle = await this.assignments.findVehicleForAssignment(
        dto.vehicleId,
      );
      if (!vehicle) {
        throw new ForbiddenException('Vehicle not found or access denied');
      }
      assignment.vehicleId = vehicle.id;
      assignment.vehicle = vehicle;
      assignment.branchId = vehicle.branchId ?? undefined;
    }

    if (dto.driverId) {
      const driver = await this.assignments.findDriverForAssignment(
        dto.driverId,
      );
      if (!driver) {
        throw new ForbiddenException('Driver not found or access denied');
      }
      assignment.driverId = driver.id;
      assignment.driver = driver;
    }

    if (dto.startDate) {
      assignment.startDate = new Date(dto.startDate);
    }

    if (dto.endDate !== undefined) {
      assignment.endDate = dto.endDate ? new Date(dto.endDate) : undefined;
    }

    // Check for conflicts after updates
    const conflicting = await this.assignments.findOverlappingAssignment(
      assignment.driverId,
      assignment.vehicleId,
      assignment.startDate,
      assignment.endDate ?? undefined,
      assignment.id,
    );

    if (conflicting) {
      const isDriverConflict = conflicting.driverId === assignment.driverId;
      const msg = isDriverConflict
        ? `Driver is already assigned to vehicle ${
            conflicting.vehicle?.plateNumber ?? 'unknown'
          }`
        : `Vehicle is already assigned to driver ${
            conflicting.driver?.name ?? 'unknown'
          }`;
      throw new ConflictException(msg);
    }

    return this.assignments.save(assignment);
  }

  async remove(id: string, user: JwtUser) {
    const assignment = await this.assignments.findOneById(id);

    if (!assignment) {
      throw new NotFoundException('Assignment not found or access denied');
    }

    await this.assignments.remove(assignment);
    return { message: 'Assignment deleted successfully' };
  }
}
