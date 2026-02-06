import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { RequestContextService } from '../../common/request-context/request-context.service';
import * as schema from '../../db/schema';
import { BranchResponseDto } from '../branch/dto/branch.response.dto';
import { UserResponseDto } from '../user/dto/user.response.dto';
import { DriverResponseDto } from './dto/driver.response.dto';

@Injectable()
export class DriverRepository {
  constructor(private readonly ctx: RequestContextService) {}

  private get db() {
    return this.ctx.getDb();
  }

  findAll() {
    return this.db.query.drivers.findMany({
      with: {
        company: true,
        branch: true,
        user: true,
        createdBy: true,
      },
      where: (drivers, { isNull }) => isNull(drivers.deletedAt),
    }) as any;
  }

  async findOneById(id: string) {
    const row = await this.db.query.drivers.findFirst({
      with: {
        company: true,
        branch: true,
        user: true,
        createdBy: true,
      },
      where: (drivers, { and, eq, isNull }) =>
        and(eq(drivers.id, id), isNull(drivers.deletedAt)),
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

  findUserWithinCompany(userId: string, companyId: string) {
    return this.db.query.users.findFirst({
      where: (users, { and, eq, isNull }) =>
        and(
          eq(users.id, userId),
          eq(users.companyId, companyId),
          isNull(users.deletedAt),
        ),
    }) as any as Promise<UserResponseDto | null>;
  }

  create(data: Partial<DriverResponseDto>): DriverResponseDto {
    const now = new Date();

    const companyId = data.companyId ?? this.ctx.requireCompanyId();
    const createdById = data.createdById ?? this.ctx.userId();

    const licenseExpiry =
      typeof (data as any).licenseExpiry === 'string'
        ? new Date((data as any).licenseExpiry)
        : data.licenseExpiry;

    return {
      ...data,
      companyId,
      createdById: createdById ?? undefined,
      isActive: data.isActive ?? true,
      licenseExpiry,
      createdAt: data.createdAt ?? now,
      updatedAt: data.updatedAt ?? now,
    } as DriverResponseDto;
  }

  async save(driver: DriverResponseDto) {
    const values: any = {
      userId: driver.userId ?? null,
      name: driver.name ?? null,
      phone: driver.phone ?? null,
      companyId: driver.companyId,
      branchId: driver.branchId ?? null,
      licenseNumber: driver.licenseNumber ?? null,
      licenseExpiry: driver.licenseExpiry ?? null,
      startWorkingTime: driver.startWorkingTime ?? null,
      endWorkingTime: driver.endWorkingTime ?? null,
      isActive: driver.isActive ?? true,
      createdById: driver.createdById ?? null,
      updatedAt: new Date(),
    };

    if (driver.id) {
      const [updated] = await this.db
        .update(schema.drivers)
        .set(values)
        .where(
          and(
            eq(schema.drivers.id, driver.id),
            isNull(schema.drivers.deletedAt),
          ),
        )
        .returning({ id: schema.drivers.id });

      if (!updated) return null;
      return this.findOneById(updated.id);
    }

    const [created] = await this.db
      .insert(schema.drivers)
      .values({
        ...values,
        createdAt: new Date(),
      })
      .returning({ id: schema.drivers.id });

    return this.findOneById(created.id);
  }

  async remove(driver: DriverResponseDto) {
    const [deleted] = await this.db
      .update(schema.drivers)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(eq(schema.drivers.id, driver.id), isNull(schema.drivers.deletedAt)),
      )
      .returning({ id: schema.drivers.id });

    if (!deleted) return null;
    return driver;
  }

  private generateInviteCode(): string {
    return randomBytes(4).toString('hex').toUpperCase();
  }

  async createInvite(data: {
    driverId: string;
    companyId: string;
    branchId?: string;
    expiresAt?: Date;
    createdById?: string;
  }) {
    const code = this.generateInviteCode();

    const [created] = await this.db
      .insert(schema.driverInvites)
      .values({
        code,
        driverId: data.driverId,
        companyId: data.companyId,
        branchId: data.branchId ?? null,
        expiresAt: data.expiresAt ?? null,
        createdById: data.createdById ?? null,
      })
      .returning();

    return created;
  }

  async findActiveInviteByDriverId(driverId: string) {
    return this.db.query.driverInvites.findFirst({
      where: (invites, { and, eq, isNull }) =>
        and(eq(invites.driverId, driverId), isNull(invites.usedAt)),
      with: {
        driver: true,
      },
    });
  }

  async revokeInvite(inviteId: string) {
    const [revoked] = await this.db
      .delete(schema.driverInvites)
      .where(
        and(
          eq(schema.driverInvites.id, inviteId),
          isNull(schema.driverInvites.usedAt),
        ),
      )
      .returning({ id: schema.driverInvites.id });

    return !!revoked;
  }

  async findMobileUsersByDriverId(driverId: string) {
    return this.db.query.mobileUsers.findMany({
      where: (mobileUsers, { and, eq, isNull }) =>
        and(eq(mobileUsers.driverId, driverId), isNull(mobileUsers.deletedAt)),
      with: {
        branch: true,
        role: true,
      },
    });
  }

  // Mobile User Management Methods

  findAllMobileUsers() {
    return this.db.query.mobileUsers.findMany({
      with: {
        company: true,
        branch: true,
        driver: true,
      },
      where: (mobileUsers, { isNull }) => isNull(mobileUsers.deletedAt),
    });
  }

  findMobileUserById(id: string) {
    return this.db.query.mobileUsers.findFirst({
      with: {
        company: true,
        branch: true,
        role: true,
        driver: true,
      },
      where: (mobileUsers, { and, eq, isNull }) =>
        and(eq(mobileUsers.id, id), isNull(mobileUsers.deletedAt)),
    }) as any;
  }

  async updateMobileUser(
    id: string,
    data: {
      permissions?: string | null;
      isBlocked?: boolean;
      name?: string;
      email?: string;
      phone?: string;
    },
  ) {
    const result = await this.db
      .update(schema.mobileUsers)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(schema.mobileUsers.id, id))
      .returning();

    return result[0];
  }

  async softDeleteMobileUser(id: string) {
    const result = await this.db
      .update(schema.mobileUsers)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.mobileUsers.id, id))
      .returning();

    return result[0];
  }
}
