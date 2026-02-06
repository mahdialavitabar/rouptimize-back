import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RequestContextService } from '../../common/request-context/request-context.service';
import type { JwtUser } from '../core/auth/shared/interfaces/jwt-user.interface';
import { DriverRepository } from './driver.repository';
import { CreateDriverInviteRequestDto } from './dto/create-driver-invite.request.dto';
import { CreateDriverRequestDto } from './dto/create-driver.request.dto';
import { UpdateDriverRequestDto } from './dto/update-driver.request.dto';
import { UpdateMobileUserRequestDto } from './dto/update-mobile-user.request.dto';

@Injectable()
export class DriverService {
  constructor(
    private readonly drivers: DriverRepository,
    private readonly ctx: RequestContextService,
  ) {}

  async create(dto: CreateDriverRequestDto, user: JwtUser) {
    const companyId = this.ctx.requireCompanyId();

    let branchIdToAssign: string | undefined;

    if (dto.branchId) {
      if (!this.ctx.isSuperAdmin() && !this.ctx.isCompanyAdmin()) {
        throw new ForbiddenException(
          'You cannot assign a branch to this driver',
        );
      }

      const branch = await this.drivers.findBranchWithinCompany(
        dto.branchId,
        companyId,
      );
      if (!branch) {
        throw new ForbiddenException('Branch not found in your company');
      }
      branchIdToAssign = branch.id;
    } else {
      branchIdToAssign = user.branchId;
    }

    let driverUser = null;
    if (dto.userId) {
      if (!this.ctx.isSuperAdmin() && !this.ctx.isCompanyAdmin()) {
        throw new ForbiddenException('You cannot link a user to this driver');
      }
      driverUser = await this.drivers.findUserWithinCompany(
        dto.userId,
        companyId,
      );
      if (!driverUser) {
        throw new ForbiddenException('User not found in your company');
      }
    }

    const driver = this.drivers.create({
      ...dto,
      companyId,
      branchId: branchIdToAssign,
      userId: driverUser?.id ?? dto.userId,
      user: driverUser ? ({ id: driverUser.id } as any) : undefined,
      createdById: user.userId,
      createdBy: { id: user.userId } as any,
    });

    return this.drivers.save(driver);
  }

  findAll(user: JwtUser) {
    return this.drivers.findAll();
  }

  async findOne(id: string, user: JwtUser) {
    const driver = await this.drivers.findOneById(id);

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    return driver;
  }

  async update(id: string, dto: UpdateDriverRequestDto, user: JwtUser) {
    const driver = await this.drivers.findOneById(id);

    if (!driver) {
      throw new NotFoundException('Driver not found or access denied');
    }

    if (dto.branchId) {
      if (!this.ctx.isSuperAdmin() && !this.ctx.isCompanyAdmin()) {
        throw new ForbiddenException(
          'You cannot change the branch of this driver',
        );
      }

      const branch = await this.drivers.findBranchWithinCompany(
        dto.branchId,
        this.ctx.requireCompanyId(),
      );
      if (!branch) {
        throw new ForbiddenException('Branch not found in your company');
      }

      driver.branchId = branch.id;
    }

    if (dto.userId) {
      const driverUser = await this.drivers.findUserWithinCompany(
        dto.userId,
        this.ctx.requireCompanyId(),
      );
      if (!driverUser) {
        throw new ForbiddenException('User not found in your company');
      }

      driver.userId = driverUser.id;
      driver.user = { id: driverUser.id } as any;
    }

    delete (dto as any).company;
    delete (dto as any).companyId;

    Object.assign(driver, dto);

    return this.drivers.save(driver);
  }

  async remove(id: string, user: JwtUser) {
    const driver = await this.drivers.findOneById(id);

    if (!driver) {
      throw new NotFoundException('Driver not found or access denied');
    }

    await this.drivers.remove(driver);
    return { message: 'Driver deleted successfully' };
  }

  async createInvite(dto: CreateDriverInviteRequestDto, user: JwtUser) {
    const companyId = this.ctx.requireCompanyId();

    const driver = await this.drivers.findOneById(dto.driverId);
    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    const existingInvite = await this.drivers.findActiveInviteByDriverId(
      dto.driverId,
    );
    if (existingInvite) {
      throw new ConflictException(
        'An active invite already exists for this driver. Revoke it first.',
      );
    }

    if (dto.branchId) {
      const branch = await this.drivers.findBranchWithinCompany(
        dto.branchId,
        companyId,
      );
      if (!branch) {
        throw new ForbiddenException('Branch not found in your company');
      }

      if (driver.branchId && driver.branchId !== dto.branchId) {
        throw new BadRequestException('Invite branch must match driver branch');
      }
    }

    // Default expiration: 7 days from now
    const defaultExpiresAt = new Date();
    defaultExpiresAt.setDate(defaultExpiresAt.getDate() + 7);

    const invite = await this.drivers.createInvite({
      driverId: dto.driverId,
      companyId,
      branchId: dto.branchId ?? driver.branchId,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : defaultExpiresAt,
      createdById: user.userId,
    });

    return {
      id: invite.id,
      code: invite.code,
      driverId: invite.driverId,
      driverName: driver.name,
      expiresAt: invite.expiresAt,
      createdAt: invite.createdAt,
    };
  }

  async getDriverInvite(driverId: string, user: JwtUser) {
    const driver = await this.drivers.findOneById(driverId);
    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    const invite = await this.drivers.findActiveInviteByDriverId(driverId);
    if (!invite) {
      return null;
    }

    return {
      id: invite.id,
      code: invite.code,
      driverId: invite.driverId,
      driverName: driver.name,
      expiresAt: invite.expiresAt,
      createdAt: invite.createdAt,
    };
  }

  async revokeInvite(driverId: string, user: JwtUser) {
    const driver = await this.drivers.findOneById(driverId);
    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    const invite = await this.drivers.findActiveInviteByDriverId(driverId);
    if (!invite) {
      throw new NotFoundException('No active invite found for this driver');
    }

    await this.drivers.revokeInvite(invite.id);
    return { message: 'Invite revoked successfully' };
  }

  async getDriverDevices(driverId: string, user: JwtUser) {
    const driver = await this.drivers.findOneById(driverId);
    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    return this.drivers.findMobileUsersByDriverId(driverId);
  }

  // Mobile User Management Methods

  async findAllMobileUsers(user: JwtUser) {
    return this.drivers.findAllMobileUsers();
  }

  async findOneMobileUser(id: string, user: JwtUser) {
    const mobileUser = await this.drivers.findMobileUserById(id);
    if (!mobileUser) {
      throw new NotFoundException('Mobile user not found');
    }
    return mobileUser;
  }

  async updateMobileUser(
    id: string,
    dto: UpdateMobileUserRequestDto,
    user: JwtUser,
  ) {
    const mobileUser = await this.drivers.findMobileUserById(id);
    if (!mobileUser) {
      throw new NotFoundException('Mobile user not found');
    }

    // Convert permissions array to comma-separated string if provided
    const updateData: {
      permissions?: string | null;
      isBlocked?: boolean;
      name?: string;
      email?: string;
      phone?: string;
    } = {};

    if (dto.permissions !== undefined) {
      updateData.permissions = dto.permissions.join(',');
    }
    if (dto.isBlocked !== undefined) {
      updateData.isBlocked = dto.isBlocked;
    }
    if (dto.name !== undefined) {
      updateData.name = dto.name;
    }
    if (dto.email !== undefined) {
      updateData.email = dto.email;
    }
    if (dto.phone !== undefined) {
      updateData.phone = dto.phone;
    }

    return this.drivers.updateMobileUser(id, updateData);
  }

  async blockMobileUser(id: string, user: JwtUser) {
    const mobileUser = await this.drivers.findMobileUserById(id);
    if (!mobileUser) {
      throw new NotFoundException('Mobile user not found');
    }

    return this.drivers.updateMobileUser(id, { isBlocked: true });
  }

  async unblockMobileUser(id: string, user: JwtUser) {
    const mobileUser = await this.drivers.findMobileUserById(id);
    if (!mobileUser) {
      throw new NotFoundException('Mobile user not found');
    }

    return this.drivers.updateMobileUser(id, { isBlocked: false });
  }

  async removeMobileUser(id: string, user: JwtUser) {
    const mobileUser = await this.drivers.findMobileUserById(id);
    if (!mobileUser) {
      throw new NotFoundException('Mobile user not found');
    }

    await this.drivers.softDeleteMobileUser(id);
    return { message: 'Mobile user deleted successfully' };
  }
}
