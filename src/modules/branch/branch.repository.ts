import { Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { RequestContextService } from '../../common/request-context/request-context.service';
import * as schema from '../../db/schema';
import { BranchResponseDto } from './dto/branch.response.dto';
import { CreateBranchRequestDto } from './dto/create-branch.request.dto';

@Injectable()
export class BranchRepository {
  constructor(private readonly requestContext: RequestContextService) {}

  private get db() {
    return this.requestContext.getDb();
  }

  async createInCurrentCompany(
    dto: CreateBranchRequestDto,
  ): Promise<BranchResponseDto> {
    const companyId = this.requestContext.requireCompanyId();

    const [created] = await this.db
      .insert(schema.branches)
      .values({
        name: dto.name,
        companyId,
      })
      .returning();

    return {
      ...created,
      companyId,
    } as any;
  }

  async findAll(): Promise<BranchResponseDto[]> {
    const rows = await this.db.query.branches.findMany({
      where: (branches, { isNull }) => isNull(branches.deletedAt),
    });

    return rows.map((branch) => ({
      ...branch,
      companyId: branch.companyId,
    })) as any;
  }

  async findOneOrThrow(id: string): Promise<BranchResponseDto> {
    const branch = await this.db.query.branches.findFirst({
      where: (branches, { and, eq, isNull }) =>
        and(eq(branches.id, id), isNull(branches.deletedAt)),
    });

    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    return {
      ...branch,
      companyId: branch.companyId,
    } as any;
  }

  async update(
    id: string,
    dto: Partial<CreateBranchRequestDto>,
  ): Promise<BranchResponseDto> {
    const [updated] = await this.db
      .update(schema.branches)
      .set({
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(schema.branches.id, id), isNull(schema.branches.deletedAt)))
      .returning();

    if (!updated) {
      throw new NotFoundException('Branch not found');
    }

    return { ...updated, companyId: updated.companyId } as any;
  }

  async removeById(id: string): Promise<void> {
    const [deleted] = await this.db
      .update(schema.branches)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(schema.branches.id, id), isNull(schema.branches.deletedAt)))
      .returning({ id: schema.branches.id });

    if (!deleted) {
      throw new NotFoundException('Branch not found');
    }
  }
}
