import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { RequestContextService } from '../../../../common/request-context/request-context.service';
import { driverInvites, mobileUsers } from '../../../../db/schema';
import { DEFAULT_MOBILE_PERMISSIONS_STRING } from '../shared/constants/permissions';

@Injectable()
export class MobileUserRepository {
  constructor(private readonly ctx: RequestContextService) {}

  private get db() {
    return this.ctx.getDb();
  }

  findAuthSeedsByUsername(username: string) {
    return this.db.query.mobileUsers.findMany({
      columns: {
        id: true,
        username: true,
        password: true,
        companyId: true,
        branchId: true,
        roleId: true,
        driverId: true,
        permissions: true,
        isBlocked: true,
        isSuperAdmin: true,
      },
      where: (mobileUsers, { and, eq, isNull }) =>
        and(eq(mobileUsers.username, username), isNull(mobileUsers.deletedAt)),
    });
  }

  findAuthSeedByUsernameAndCompanyId(username: string, companyId: string) {
    return this.db.query.mobileUsers.findFirst({
      columns: {
        id: true,
        username: true,
        password: true,
        companyId: true,
        branchId: true,
        roleId: true,
        driverId: true,
        permissions: true,
        isBlocked: true,
        isSuperAdmin: true,
      },
      where: (mobileUsers, { and, eq, isNull }) =>
        and(
          eq(mobileUsers.username, username),
          eq(mobileUsers.companyId, companyId),
          isNull(mobileUsers.deletedAt),
        ),
    });
  }

  findByUsernameAndCompanyId(username: string, companyId: string) {
    return this.db.query.mobileUsers.findFirst({
      where: (mobileUsers, { and, eq, isNull }) =>
        and(
          eq(mobileUsers.username, username),
          eq(mobileUsers.companyId, companyId),
          isNull(mobileUsers.deletedAt),
        ),
    });
  }

  findOneById(id: string) {
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

  findValidInviteByCode(code: string) {
    return this.db.query.driverInvites.findFirst({
      where: (driverInvites, { and, eq, isNull }) =>
        and(eq(driverInvites.code, code), isNull(driverInvites.usedAt)),
      with: {
        driver: true,
      },
    });
  }

  async markInviteAsUsed(inviteId: string, mobileUserId: string) {
    await this.db
      .update(driverInvites)
      .set({
        usedAt: new Date(),
        usedByMobileUserId: mobileUserId,
      })
      .where(eq(driverInvites.id, inviteId));
  }

  async create(data: {
    username: string;
    password: string;
    companyId: string;
    name?: string;
    email?: string;
    phone?: string;
    branchId?: string | null;
    driverId?: string | null;
    permissions?: string | null;
  }) {
    const result = await this.db
      .insert(mobileUsers)
      .values({
        username: data.username,
        password: data.password,
        companyId: data.companyId,
        name: data.name,
        email: data.email,
        phone: data.phone,
        branchId: data.branchId ?? null,
        driverId: data.driverId ?? null,
        permissions: data.permissions ?? DEFAULT_MOBILE_PERMISSIONS_STRING,
        isBlocked: false,
      })
      .returning();

    return result[0];
  }

  findAll() {
    return this.db.query.mobileUsers.findMany({
      with: {
        company: true,
        branch: true,
        driver: true,
      },
      where: (mobileUsers, { isNull }) => isNull(mobileUsers.deletedAt),
    });
  }

  async update(
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
      .update(mobileUsers)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(mobileUsers.id, id))
      .returning();

    return result[0];
  }

  async softDelete(id: string) {
    const result = await this.db
      .update(mobileUsers)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(mobileUsers.id, id))
      .returning();

    return result[0];
  }
}
