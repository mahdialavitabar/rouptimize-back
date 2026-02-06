import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RequestContextService } from '../../common/request-context/request-context.service';
import type { JwtUser } from '../core/auth/shared/interfaces/jwt-user.interface';
import { CompanyBalanceService } from '../core/company-balance/company-balance.service';
import { CreateVehicleRequestDto } from './dto/create-vehicle.request.dto';
import { UpdateVehicleRequestDto } from './dto/update-vehicle.request.dto';
import { VehicleRepository } from './vehicle.repository';

@Injectable()
export class VehicleService {
  constructor(
    private readonly vehicles: VehicleRepository,
    private readonly ctx: RequestContextService,
    private readonly companyBalance: CompanyBalanceService,
  ) {}

  async create(dto: CreateVehicleRequestDto, user: JwtUser) {
    if (!user.branchId) {
      throw new ForbiddenException('User does not have a branch assigned');
    }

    const companyId = this.ctx.requireCompanyId();

    let branchIdToAssign = user.branchId;

    if (dto.branchId) {
      if (!this.ctx.isSuperAdmin() && !this.ctx.isCompanyAdmin()) {
        throw new ForbiddenException(
          'You cannot assign a branch to this vehicle',
        );
      }

      const branch = await this.vehicles.findBranchWithinCompany(
        dto.branchId,
        companyId,
      );
      if (!branch) {
        throw new ForbiddenException('Branch not found in your company');
      }
      branchIdToAssign = branch.id;
    }

    const vehicle = this.vehicles.create({
      ...dto,
      companyId,
      branchId: branchIdToAssign,
      createdById: user.userId,
      createdBy: { id: user.userId } as any,
    });

    await this.companyBalance.consume('vehicle_create');
    return this.vehicles.save(vehicle);
  }

  findAll(user: JwtUser, branchId?: string) {
    return this.vehicles.findAll(branchId);
  }

  async findOne(id: string, user: JwtUser) {
    const vehicle = await this.vehicles.findOneById(id);

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    return vehicle;
  }

  async update(id: string, dto: UpdateVehicleRequestDto, user: JwtUser) {
    const vehicle = await this.vehicles.findOneById(id);

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found or access denied');
    }

    if (dto.branchId) {
      if (!this.ctx.isSuperAdmin() && !this.ctx.isCompanyAdmin()) {
        throw new ForbiddenException(
          'You cannot change the branch of this vehicle',
        );
      }

      const branch = await this.vehicles.findBranchWithinCompany(
        dto.branchId,
        this.ctx.requireCompanyId(),
      );
      if (!branch) {
        throw new ForbiddenException('Branch not found in your company');
      }

      vehicle.branchId = branch.id;
    }

    delete (dto as any).company;
    delete (dto as any).companyId;

    Object.assign(vehicle, dto);

    return this.vehicles.save(vehicle);
  }

  async remove(id: string, user: JwtUser) {
    const vehicle = await this.vehicles.findOneById(id);

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found or access denied');
    }

    await this.vehicles.remove(vehicle);
    return { message: 'Vehicle deleted successfully' };
  }
}
