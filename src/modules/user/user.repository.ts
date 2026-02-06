import { Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { RequestContextService } from '../../common/request-context/request-context.service';
import * as schema from '../../db/schema';
import { UserResponseDto } from './dto/user.response.dto';

@Injectable()
export class UserRepository {
  constructor(private readonly ctx: RequestContextService) {}

  private get db() {
    return this.ctx.getDb();
  }

  findAll() {
    return this.db.query.users.findMany({
      with: {
        company: true,
        branch: true,
        role: true,
      },
      where: (users, { isNull }) => isNull(users.deletedAt),
    }) as any;
  }

  async findOneById(id: string) {
    const row = await this.db.query.users.findFirst({
      with: {
        company: true,
        branch: true,
        role: true,
      },
      where: (users, { and, eq, isNull }) =>
        and(eq(users.id, id), isNull(users.deletedAt)),
    });

    return (row as any) ?? null;
  }

  async findUserOrMobileById(id: string) {
    // First try users table
    let row = await this.db.query.users.findFirst({
      with: {
        company: true,
        branch: true,
        role: true,
      },
      where: (users, { and, eq, isNull }) =>
        and(eq(users.id, id), isNull(users.deletedAt)),
    });

    if (row) return row as any;

    // If not found, try mobileUsers table
    row = await this.db.query.mobileUsers.findFirst({
      with: {
        company: true,
        branch: true,
        role: true,
      },
      where: (mobileUsers, { and, eq, isNull }) =>
        and(eq(mobileUsers.id, id), isNull(mobileUsers.deletedAt)),
    });

    return (row as any) ?? null;
  }

  async findOneByUsername(username: string) {
    const row = await this.db.query.users.findFirst({
      with: {
        company: true,
        branch: true,
        role: true,
      },
      where: (users, { and, eq, isNull }) =>
        and(eq(users.username, username), isNull(users.deletedAt)),
    });

    return (row as any) ?? null;
  }

  findAuthSeedByUsername(username: string) {
    return this.db.query.users.findFirst({
      columns: {
        id: true,
        username: true,
        password: true,
        companyId: true,
        branchId: true,
        roleId: true,
        isSuperAdmin: true,
      },
      where: (users, { and, eq, isNull }) =>
        and(eq(users.username, username), isNull(users.deletedAt)),
    });
  }

  findRoleForAssignment(roleId: string) {
    return this.db.query.roles.findFirst({
      where: (roles, { and, eq, isNull }) =>
        and(eq(roles.id, roleId), isNull(roles.deletedAt)),
    }) as any;
  }

  findBranchForAssignment(branchId: string) {
    return this.db.query.branches.findFirst({
      where: (branches, { and, eq, isNull }) =>
        and(eq(branches.id, branchId), isNull(branches.deletedAt)),
    }) as any;
  }

  findMainBranch() {
    return this.db.query.branches.findFirst({
      where: (branches, { and, eq, isNull }) =>
        and(eq(branches.name, 'main'), isNull(branches.deletedAt)),
    }) as any;
  }

  create(data: Partial<UserResponseDto>) {
    return data as any;
  }

  async save(user: UserResponseDto) {
    const values: any = {
      username: user.username,
      password: user.password,
      name: user.name ?? null,
      email: user.email ?? null,
      phone: user.phone ?? null,
      address: user.address ?? null,
      imageUrl: user.imageUrl ?? null,
      companyId: user.companyId,
      branchId: user.branchId ?? null,
      roleId: user.roleId ?? null,
      isSuperAdmin: user.isSuperAdmin ?? false,
      updatedAt: new Date(),
    };

    if (user.id) {
      const [updated] = await this.db
        .update(schema.users)
        .set(values)
        .where(
          and(eq(schema.users.id, user.id), isNull(schema.users.deletedAt)),
        )
        .returning({ id: schema.users.id });

      if (!updated) {
        return null;
      }

      return this.findOneById(updated.id);
    }

    const [created] = await this.db
      .insert(schema.users)
      .values({
        ...values,
        createdAt: new Date(),
      })
      .returning({ id: schema.users.id });

    return this.findOneById(created.id);
  }

  async remove(user: UserResponseDto) {
    const [deleted] = await this.db
      .update(schema.users)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(schema.users.id, user.id), isNull(schema.users.deletedAt)))
      .returning({ id: schema.users.id });

    if (!deleted) {
      return null;
    }

    return user;
  }

  async saveMobileUser(user: any) {
    const { id, ...values } = user;

    const [updated] = await this.db
      .update(schema.mobileUsers)
      .set({ ...values, updatedAt: new Date() })
      .where(
        and(
          eq(schema.mobileUsers.id, id),
          isNull(schema.mobileUsers.deletedAt),
        ),
      )
      .returning({ id: schema.mobileUsers.id });

    if (!updated) {
      return null;
    }

    return this.findUserOrMobileById(updated.id);
  }
}
