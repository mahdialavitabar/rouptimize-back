import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { DB_POOL } from '../../common/database/database.tokens';
import { setLocalRlsRole } from '../../common/database/rls-role';
import * as schema from '../../db/schema';
import { PERMISSIONS } from '../core/auth/shared/constants/permissions';
import type { JwtUser } from '../core/auth/shared/interfaces/jwt-user.interface';
import { FORBIDDEN_USERNAMES } from '../core/auth/shared/utils/username-blacklist';
import { CompanyRepository } from './company.repository';
import { RegisterCompanyRequestDto } from './dto/register-company.request.dto';
import { UpdateCompanyRequestDto } from './dto/update-company.request.dto';

@Injectable()
export class CompanyService {
  constructor(
    private readonly companyRepository: CompanyRepository,
    @Inject(DB_POOL)
    private readonly pool: Pool,
  ) {}

  async createWithAdmin(dto: RegisterCompanyRequestDto) {
    const normalizedUsername = dto.adminUsername.trim().toLowerCase();

    if (FORBIDDEN_USERNAMES.has(normalizedUsername)) {
      throw new ConflictException('This username is reserved or not allowed');
    }

    const pgClient = await this.pool.connect();
    try {
      await pgClient.query('BEGIN');
      await setLocalRlsRole(pgClient);
      const db = drizzle(pgClient, { schema });

      const existingUserRows = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.username, normalizedUsername))
        .limit(1);

      const existingUserRow = (existingUserRows as any[])[0] ?? null;

      if (existingUserRow) {
        throw new ConflictException('Username already exists');
      }

      const [company] = await db
        .insert(schema.companies)
        .values({ name: dto.name })
        .returning();

      await pgClient.query(
        "SELECT set_config('app.current_company_id', $1::text, true)",
        [company.id],
      );

      await db.insert(schema.companyBalances).values({
        companyId: company.id,
        type: 'per_missions',
        total: null,
        remaining: null,
        monthlyLimit: null,
        periodStart: null,
      });

      const [mainBranchRow] = await db
        .insert(schema.branches)
        .values({ name: 'main', companyId: company.id })
        .returning();

      const allPermissions = Object.values(PERMISSIONS).flatMap((group) =>
        Object.values(group),
      );

      const [companyAdminRoleRow] = await db
        .insert(schema.roles)
        .values({
          name: 'companyAdmin',
          description: 'Company admin role with full permissions',
          authorizations: allPermissions.length
            ? allPermissions.join(',')
            : null,
          companyId: company.id,
        })
        .returning();

      const hashedPassword = await bcrypt.hash(dto.adminPassword, 10);

      const [adminUserRow] = await db
        .insert(schema.users)
        .values({
          username: normalizedUsername,
          password: hashedPassword,
          companyId: company.id,
          roleId: companyAdminRoleRow.id,
          branchId: mainBranchRow.id,
          isSuperAdmin: false,
        })
        .returning();

      await pgClient.query('COMMIT');

      const companyAdminRole = {
        ...companyAdminRoleRow,
        authorizations: allPermissions,
        company,
      } as any;

      const mainBranch = {
        ...mainBranchRow,
        company,
      } as any;

      const adminUser = {
        ...adminUserRow,
        company,
        role: companyAdminRole,
        branch: mainBranch,
      } as any;

      return { company, adminUser, mainBranch };
    } catch (e) {
      await pgClient.query('ROLLBACK');
      throw e;
    } finally {
      pgClient.release();
    }
  }

  findAll(currentUser: JwtUser) {
    if (!currentUser.isSuperAdmin) {
      throw new ForbiddenException('Only superadmin can read companies');
    }
    return this.companyRepository.findAll();
  }

  findOne(id: string, currentUser: JwtUser) {
    if (!currentUser.isSuperAdmin) {
      throw new ForbiddenException('Only superadmin can update companies');
    }
    return this.companyRepository.findOne(id);
  }

  update(id: string, dto: UpdateCompanyRequestDto, currentUser: JwtUser) {
    if (!currentUser.isSuperAdmin) {
      throw new ForbiddenException('Only superadmin can update companies');
    }
    return this.companyRepository.update(id, dto);
  }

  remove(id: string, currentUser: JwtUser) {
    if (!currentUser.isSuperAdmin) {
      throw new ForbiddenException('Only superadmin can delete companies');
    }
    return this.companyRepository.remove(id);
  }
}
