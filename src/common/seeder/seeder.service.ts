import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import * as schema from '../../db/schema';
import { PERMISSIONS } from '../../modules/core/auth/shared/constants/permissions';
import { DB_POOL } from '../database/database.tokens';

@Injectable()
export class SeederService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeederService.name);

  constructor(
    @Inject(DB_POOL)
    private readonly pool: Pool,
    private readonly configService: ConfigService,
  ) {}

  async onApplicationBootstrap() {
    const shouldSeed = this.configService.get<string>(
      'SEED_SUPER_ADMIN',
      'true',
    );
    if (shouldSeed !== 'true') {
      this.logger.log('Super admin seeding is disabled');
      return;
    }

    await this.seedSuperAdmin();
  }

  private async seedSuperAdmin(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const db = drizzle(client, { schema });

      const existingSuperAdminRows = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.isSuperAdmin, true))
        .limit(1);

      const existingSuperAdmin = (existingSuperAdminRows as any[])[0] ?? null;

      const superAdminUsername = this.configService.get<string>(
        'SUPER_ADMIN_USERNAME',
        'superadmin',
      );
      const superAdminPassword = this.configService.get<string>(
        'SUPER_ADMIN_PASSWORD',
        'superadminpassword',
      );
      const superAdminEmail = this.configService.get<string>(
        'SUPER_ADMIN_EMAIL',
        'superadmin@example.com',
      );

      const companyRows = await db
        .select()
        .from(schema.companies)
        .where(eq(schema.companies.name, 'Main Company'))
        .limit(1);

      let company = (companyRows as any[])[0] ?? null;

      if (!company) {
        const [createdCompany] = await db
          .insert(schema.companies)
          .values({ name: 'Main Company' })
          .returning();
        company = createdCompany;
      }

      const branchRows = await db
        .select()
        .from(schema.branches)
        .where(
          and(
            eq(schema.branches.name, 'main'),
            eq(schema.branches.companyId, company.id),
          ),
        )
        .limit(1);

      let branch = (branchRows as any[])[0] ?? null;

      if (!branch) {
        const [createdBranch] = await db
          .insert(schema.branches)
          .values({ name: 'main', companyId: company.id })
          .returning();
        branch = createdBranch;
      }

      const roleRows = await db
        .select()
        .from(schema.roles)
        .where(
          and(
            eq(schema.roles.name, 'Super Admin'),
            eq(schema.roles.companyId, company.id),
          ),
        )
        .limit(1);

      let role = (roleRows as any[])[0] ?? null;

      const allPermissions = Object.values(PERMISSIONS).flatMap((group) =>
        Object.values(group),
      );

      const serializedAuth = allPermissions.length
        ? allPermissions.join(',')
        : null;

      if (!role) {
        const [createdRole] = await db
          .insert(schema.roles)
          .values({
            name: 'Super Admin',
            authorizations: serializedAuth,
            companyId: company.id,
          })
          .returning();
        role = createdRole;
      } else {
        await db
          .update(schema.roles)
          .set({ authorizations: serializedAuth, updatedAt: new Date() })
          .where(eq(schema.roles.id, role.id));
      }

      const hashedPassword = await bcrypt.hash(superAdminPassword, 10);

      if (existingSuperAdmin) {
        await db
          .update(schema.users)
          .set({
            username: superAdminUsername,
            email: superAdminEmail,
            password: hashedPassword,
            companyId: company.id,
            branchId: branch.id,
            roleId: role.id,
            updatedAt: new Date(),
          })
          .where(eq(schema.users.isSuperAdmin, true));

        await client.query('COMMIT');
        this.logger.log(
          '✅ Super admin already exists; credentials and relations updated',
        );
        return;
      }

      await db.insert(schema.users).values({
        username: superAdminUsername,
        email: superAdminEmail,
        password: hashedPassword,
        isSuperAdmin: true,
        roleId: role.id,
        branchId: branch.id,
        companyId: company.id,
        phone: '1234567890',
        address: 'HQ Address',
      });

      await client.query('COMMIT');
      this.logger.log('✅ Super admin created successfully');
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error('❌ Failed to seed super admin', error);
    } finally {
      client.release();
    }
  }
}
