import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { RequestContextService } from '../../common/request-context/request-context.service';
import * as schema from '../../db/schema';
import { CompanyResponseDto } from './dto/company.response.dto';
import { UpdateCompanyRequestDto } from './dto/update-company.request.dto';

@Injectable()
export class CompanyRepository {
  constructor(private readonly ctx: RequestContextService) {}

  private get db() {
    return this.ctx.getDb();
  }

  findAll(): Promise<CompanyResponseDto[]> {
    return this.db.query.companies.findMany() as any;
  }

  async findOne(id: string): Promise<CompanyResponseDto | null> {
    const row = await this.db.query.companies.findFirst({
      where: (companies, { eq }) => eq(companies.id, id),
    });

    return (row as any) ?? null;
  }

  async update(id: string, dto: UpdateCompanyRequestDto) {
    const rows = await this.db
      .update(schema.companies)
      .set({
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        updatedAt: new Date(),
      })
      .where(eq(schema.companies.id, id))
      .returning();

    return rows[0] as any;
  }

  async remove(id: string) {
    const rows = await this.db
      .delete(schema.companies)
      .where(eq(schema.companies.id, id))
      .returning({ id: schema.companies.id });

    return rows[0] as any;
  }
}
