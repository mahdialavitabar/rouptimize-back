import { Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { RequestContextService } from '../../common/request-context/request-context.service';
import * as schema from '../../db/schema';
import { CreateRoleRequestDto } from './dto/create-role.request.dto';
import { RoleResponseDto } from './dto/role.response.dto';

@Injectable()
export class RoleRepository {
  constructor(private readonly requestContext: RequestContextService) {}

  private get db() {
    return this.requestContext.getDb();
  }

  createInCurrentCompany(dto: CreateRoleRequestDto): RoleResponseDto {
    const companyId = this.requestContext.requireCompanyId();

    return {
      id: '' as any,
      name: dto.name,
      description: dto.description,
      authorizations: Array.isArray(dto.authorizations)
        ? dto.authorizations
        : [],
      companyId,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any;
  }

  async findAll(): Promise<RoleResponseDto[]> {
    const rows = await this.db.query.roles.findMany({
      where: (roles, { isNull }) => isNull(roles.deletedAt),
    });

    return rows as any;
  }

  async findOneOrThrow(id: string): Promise<RoleResponseDto> {
    const role = await this.db.query.roles.findFirst({
      where: (roles, { and, eq, isNull }) =>
        and(eq(roles.id, id), isNull(roles.deletedAt)),
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    return role as any;
  }

  async save(role: RoleResponseDto): Promise<RoleResponseDto> {
    const authorizations = Array.isArray((role as any).authorizations)
      ? (role as any).authorizations.join(',')
      : (role as any).authorizations ?? null;

    const values = {
      name: role.name,
      description: role.description ?? null,
      authorizations,
      companyId: role.companyId,
      updatedAt: new Date(),
    };

    if (role.id) {
      const [updated] = await this.db
        .update(schema.roles)
        .set(values)
        .where(
          and(eq(schema.roles.id, role.id), isNull(schema.roles.deletedAt)),
        )
        .returning();

      if (!updated) {
        throw new NotFoundException('Role not found');
      }

      return updated as any;
    }

    const [created] = await this.db
      .insert(schema.roles)
      .values({
        ...values,
        createdAt: new Date(),
      } as any)
      .returning();

    return created as any;
  }

  async remove(role: RoleResponseDto): Promise<RoleResponseDto> {
    const [deleted] = await this.db
      .update(schema.roles)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(schema.roles.id, role.id), isNull(schema.roles.deletedAt)))
      .returning();

    if (!deleted) {
      throw new NotFoundException('Role not found');
    }

    return deleted as any;
  }
}
